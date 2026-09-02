"""Auth, plans and billing primitives.

Passwords use PBKDF2-HMAC-SHA256; sessions use a signed bearer token (HMAC).
Firebase Auth / Stripe are the production path (see ``README.md``): both are
swappable here without touching the routers, and in ``AUTH_MODE=soft`` the API
falls back to the seeded demo account so a first-time visitor lands in a
workspace that is already populated.
"""
from __future__ import annotations

import hashlib
import hmac
import os
import secrets
import time
from pathlib import Path

from fastapi import Header, HTTPException

from .db import DB, new_id, now

ROOT = Path(__file__).resolve().parents[2]
_SECRET_FILE = ROOT / ".data" / "jwt.secret"
AUTH_MODE = os.environ.get("AUTH_MODE", "soft")  # soft | strict
TOKEN_TTL = 60 * 60 * 24 * 30

DEMO_EMAIL = "demo@nebula.studio"
DEMO_PASSWORD = "demo1234"


# ------------------------------------------------------------------- secrets
def _secret() -> bytes:
    env = os.environ.get("NEBULA_SECRET")
    if env:
        return env.encode()
    _SECRET_FILE.parent.mkdir(parents=True, exist_ok=True)
    if not _SECRET_FILE.exists():
        _SECRET_FILE.write_text(secrets.token_hex(32))
    return _SECRET_FILE.read_text().strip().encode()


# ------------------------------------------------------------- passwords
def hash_password(password: str, salt: str | None = None) -> str:
    salt = salt or secrets.token_hex(8)
    digest = hashlib.pbkdf2_hmac("sha256", password.encode(), salt.encode(), 120_000).hex()
    return f"pbkdf2${salt}${digest}"


def verify_password(password: str, stored: str) -> bool:
    try:
        _, salt, digest = stored.split("$")
    except ValueError:
        return False
    check = hashlib.pbkdf2_hmac("sha256", password.encode(), salt.encode(), 120_000).hex()
    return hmac.compare_digest(digest, check)


# --------------------------------------------------------------- sessions
def issue_token(user_id: str) -> str:
    payload = f"{user_id}.{int(time.time()) + TOKEN_TTL}"
    sig = hmac.new(_secret(), payload.encode(), hashlib.sha256).hexdigest()[:32]
    return f"{payload}.{sig}"


def read_token(token: str) -> str | None:
    try:
        user_id, exp, sig = token.rsplit(".", 2)
    except ValueError:
        return None
    payload = f"{user_id}.{exp}"
    want = hmac.new(_secret(), payload.encode(), hashlib.sha256).hexdigest()[:32]
    if not hmac.compare_digest(sig, want):
        return None
    if int(exp) < int(time.time()):
        return None
    return user_id


def public_user(user: dict) -> dict:
    plan = PLANS.get(user.get("plan", "free"), PLANS["free"])
    used = int(user.get("credits_used", 0))
    quota = plan["credits_monthly"]
    return {k: user.get(k) for k in ("id", "email", "name", "plan", "created_at")} | {
        "credits": {"used": used, "quota": quota, "remaining": max(0, quota - used),
                    "pct": round(min(100, used / max(1, quota) * 100), 1)},
        "plan_name": plan["name"],
        "features": plan["features"],
    }


def get_user(authorization: str | None = Header(default=None)) -> dict:
    """Dependency: resolve the caller, or hand back the demo account in soft mode."""
    if authorization and authorization.lower().startswith("bearer "):
        uid = read_token(authorization.split(" ", 1)[1].strip())
        user = DB.users.first(id=uid) if uid else None
        if user:
            return user
        if AUTH_MODE == "strict":
            raise HTTPException(401, "Session expired - sign in again")
    if AUTH_MODE == "strict":
        raise HTTPException(401, "Missing bearer token")
    demo = DB.users.first(email=DEMO_EMAIL)
    if not demo:
        raise HTTPException(503, "Demo account not seeded yet")
    return demo


# ------------------------------------------------------------------- plans
PLANS: dict[str, dict] = {
    "free": {
        "id": "free", "name": "Starter", "price_monthly": 0, "price_yearly": 0,
        "credits_monthly": 600, "seats": 1, "projects": 2, "documents": 60,
        "images_monthly": 15, "retention_days": 30,
        "tagline": "Everything you need to ship a weekly content cadence.",
        "features": ["600 credits / month", "1 seat", "2 projects", "Blog, social & email formats",
                     "Content analyzer", "15 generated images", "30-day history", "Markdown + JSON export"],
        "missing": ["Team seats", "Brand voice training", "API access", "Bulk generation"],
    },
    "pro": {
        "id": "pro", "name": "Pro", "price_monthly": 29, "price_yearly": 290, "popular": True,
        "credits_monthly": 6000, "seats": 3, "projects": 20, "documents": 5000,
        "images_monthly": 300, "retention_days": 365,
        "tagline": "For solo marketers and small teams publishing every day.",
        "features": ["6,000 credits / month", "3 seats", "20 projects", "All 7 generation formats",
                     "Prompt library + templates", "300 images / month", "1-year history",
                     "HTML / MD / CSV export", "SEO briefs"],
        "missing": ["SSO", "Audit log"],
    },
    "team": {
        "id": "team", "name": "Team", "price_monthly": 79, "price_yearly": 790,
        "credits_monthly": 30000, "seats": 15, "projects": 200, "documents": 100000,
        "images_monthly": 2000, "retention_days": 1095,
        "tagline": "Shared brand voice, review lanes and analytics for content teams.",
        "features": ["30,000 credits / month", "15 seats", "Unlimited projects", "Brand voice training",
                     "Approval workflow", "Usage analytics + CSV", "2,000 images / month",
                     "API access", "Priority model queue", "SSO ready"],
        "missing": [],
    },
    "enterprise": {
        "id": "enterprise", "name": "Enterprise", "price_monthly": None, "price_yearly": None,
        "credits_monthly": 250000, "seats": 100, "projects": None, "documents": None,
        "images_monthly": 20000, "retention_days": None,
        "tagline": "Custom models, VPC deploy, procurement-grade security.",
        "features": ["Volume credits", "Dedicated model routing", "VPC / on-prem deploy", "SCIM + SSO",
                     "Audit log + retention policy", "Custom templates", "99.9% SLA", "Solutions engineer"],
        "missing": [],
    },
}


def subscribe(user: dict, plan_id: str, cycle: str = "monthly") -> dict:
    plan = PLANS.get(plan_id)
    if not plan:
        raise HTTPException(404, f"Unknown plan '{plan_id}'")
    sub = DB.subscriptions.first(user_id=user["id"]) or {"id": new_id("sub"), "user_id": user["id"]}
    price = plan["price_yearly"] if cycle == "yearly" else plan["price_monthly"]
    sub |= {"plan_id": plan_id, "cycle": cycle, "status": "active" if price else "contact_us",
            "price": price, "started_at": now(), "renews_at": now() + (31536000 if cycle == "yearly" else 2592000),
            "provider": "stripe (mock)", "card_last4": 4242 if price else None}
    DB.subscriptions.replace_all([r if r["id"] != sub["id"] else sub for r in DB.subscriptions.all()] +
                                ([sub] if not DB.subscriptions.first(id=sub["id"]) else []))
    DB.users.update(user["id"], {"plan": plan_id})
    return sub
