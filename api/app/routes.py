"""REST API surface.

Everything the React app calls lives here: auth, workspaces, generation,
documents, templates, prompt library, analytics, billing and exports.
"""
from __future__ import annotations

import csv
import io
import json
import re
import time
import uuid
from typing import Any

from fastapi import APIRouter, Body, Depends, Header, HTTPException, Query, Response
from fastapi.responses import PlainTextResponse

from . import auth, engine, images, markdown, nlp, seed
from .auth import PLANS, DEMO_EMAIL, DEMO_PASSWORD, get_user, hash_password, issue_token, public_user, verify_password
from .db import DB, new_id, now

api = APIRouter(prefix="/api")
media_api = APIRouter()


# ---------------------------------------------------------------------------- dev niceties
@api.get("/health")
def health() -> dict:
    counts = {c: len(DB.__getattribute__(c).all()) for c in
              ("users", "projects", "documents", "templates", "prompts", "events")}
    return {"ok": True, "service": "nebula-api", "time": now(), "counts": counts, "auth_mode": auth.AUTH_MODE}


@api.get("/preview/image")
def preview_image(style: str = "aurora", ratio: str = "1:1", prompt: str = "AI content studio", title: str | None = None) -> Response:
    """Deterministic sample art for the marketing page (no auth, no credits)."""
    asset = images.generate(prompt, style, ratio, title=title, seed="preview|" + style + "|" + ratio)
    path = images.MEDIA_DIR / f"{asset['id']}.svg"
    return Response(path.read_text(), media_type="image/svg+xml",
                    headers={"Cache-Control": "public, max-age=86400"})


@api.get("/meta")
def meta() -> dict:
    """Static product config the UI needs: formats, tones, styles, credits."""
    return {
        "kinds": [
            {"id": "blog", "label": "Blog / Article", "blurb": "Outline, sections, FAQ, meta description",
             "icon": "doc", "credits": engine.CREDITS["blog"], "needs": ["prompt"], "color": "#7c5cff"},
            {"id": "analyze", "label": "Content Analyzer", "blurb": "AI-tell score, readability, fix list",
             "icon": "scan", "credits": engine.CREDITS["analyze"], "needs": ["source"], "color": "#22d3ee"},
            {"id": "caption", "label": "Social Captions", "blurb": "Platform-native, hashtag + emoji aware",
             "icon": "hash", "credits": engine.CREDITS["caption"], "needs": ["prompt"], "color": "#ff6bc4"},
            {"id": "text", "label": "AI Text", "blurb": "Email, ad, product, script, launch note",
             "icon": "pen", "credits": engine.CREDITS["text"], "needs": ["prompt"], "color": "#f7b955"},
            {"id": "rewrite", "label": "Rewrite", "blurb": "Tone, conciseness, simplify — with a change log",
             "icon": "swap", "credits": engine.CREDITS["rewrite"], "needs": ["source"], "color": "#5ce6a4"},
            {"id": "summarize", "label": "Summarize", "blurb": "TL;DR, key points, action items",
             "icon": "compress", "credits": engine.CREDITS["summarize"], "needs": ["source"], "color": "#8fb4ff"},
            {"id": "seo", "label": "SEO Keywords", "blurb": "Volume, difficulty, intent, optimisation brief",
             "icon": "search", "credits": engine.CREDITS["seo"], "needs": ["prompt"], "color": "#c8ff5c"},
            {"id": "image", "label": "Image Generation", "blurb": "6 art styles, 5 aspect ratios, SVG export",
             "icon": "image", "credits": 8, "needs": ["prompt"], "color": "#ff9b6b"},
        ],
        "tones": ["professional", "casual", "bold", "friendly", "witty", "urgent"],
        "lengths": [
            {"id": "short", "label": "Short", "words": "≈180 words"},
            {"id": "medium", "label": "Medium", "words": "≈420 words"},
            {"id": "long", "label": "Long", "words": "≈800 words"},
            {"id": "epic", "label": "Epic", "words": "≈1400 words"},
        ],
        "formats": [
            {"id": "email", "label": "Email"}, {"id": "ad", "label": "Ad copy"},
            {"id": "product", "label": "Product description"}, {"id": "script", "label": "Video script"},
            {"id": "announcement", "label": "Launch note"},
        ],
        "platforms": list(images.RATIOS) and list(engine.PLATFORMS),
        "image_styles": list(images.PALETTES),
        "image_ratios": list(images.RATIOS),
        "languages": ["English", "Spanish", "French", "German", "Portuguese", "Hindi", "Japanese"],
        "plans": list(PLANS.values()),
    }


# ---------------------------------------------------------------------------- auth
@api.post("/auth/register")
def register(payload: dict = Body(...)) -> dict:
    email = str(payload.get("email", "")).strip().lower()
    password = str(payload.get("password", ""))
    if not re.match(r"^[^@\s]+@[^@\s]+\.[a-z]{2,}$", email):
        raise HTTPException(422, "Enter a valid email address")
    if len(password) < 8:
        raise HTTPException(422, "Password must be at least 8 characters")
    if DB.users.first(email=email):
        raise HTTPException(409, "That email already has an account")
    user = {"id": new_id("usr"), "email": email, "name": payload.get("name") or email.split("@")[0].title(),
            "plan": "free", "credits_used": 0, "avatar_hue": int(dice_hex(email)) % 360,
            "role": payload.get("role") or "Founder", "company": payload.get("company") or "",
            "password": hash_password(password)}
    DB.users.insert(user)
    ws = {"id": new_id("ws"), "name": f"{user['name'].split()[0]}'s workspace", "owner_id": user["id"],
          "members": [user["id"]], "plan": "free", "color": "#7c5cff", "created_at": now(),
          "brand_voice": {"tone": "professional", "avoid": ["delve", "seamless", "leverage"],
                          "audience": "your customers", "reading_level": 60, "voice_notes": ""},
          "channels": ["blog", "linkedin"]}
    DB.projects.insert(ws)
    return {"token": issue_token(user["id"]), "user": public_user(user), "workspace_id": ws["id"]}


@api.post("/auth/login")
def login(payload: dict = Body(...)) -> dict:
    email = str(payload.get("email", "")).strip().lower()
    user = DB.users.first(email=email)
    if not user or not verify_password(str(payload.get("password", "")), user.get("password", "")):
        raise HTTPException(401, "Email or password is wrong")
    return {"token": issue_token(user["id"]), "user": public_user(user)}


@api.post("/auth/demo")
def demo_login() -> dict:
    """One-click sandbox login for the live preview."""
    user = DB.users.first(email=DEMO_EMAIL)
    if not user:
        raise HTTPException(503, "Demo account unavailable")
    return {"token": issue_token(user["id"]), "user": public_user(user),
            "email": DEMO_EMAIL, "password": DEMO_PASSWORD}


@api.post("/demo/reset")
def demo_reset(user: dict = Depends(get_user)) -> dict:
    """Return the sandbox to its factory state — wipes and re-seeds everything."""
    out = seed.seed(force=True)
    fresh = DB.users.first(email=auth.DEMO_EMAIL) or {}
    return {"ok": True, "reseeded": out, "user": public_user(fresh) if fresh else None}


@api.get("/me")
def me(user: dict = Depends(get_user)) -> dict:
    rows = [p for p in DB.projects.all()
            if p.get("owner_id") == user["id"] or user["id"] in (p.get("members") or [])]
    return {"user": public_user(user), "workspaces": [slim_project(p, user) for p in rows]}


def dice_hex(s: str) -> int:
    return int(nlp.dice(s) * 1e6)


def slim_project(p: dict, user: dict) -> dict:
    docs = DB.documents.find(workspace_id=p["id"])
    mine = DB.subscriptions.first(user_id=user["id"])
    return {**{k: p.get(k) for k in ("id", "name", "plan", "color", "members", "channels", "created_at")},
            "owner_id": p.get("owner_id"), "is_owner": p.get("owner_id") == user["id"],
            "documents": len(docs), "brand_voice": p.get("brand_voice") or {},
            "subscription": mine}


# ---------------------------------------------------------------------------- workspaces
@api.get("/workspaces")
def list_workspaces(user: dict = Depends(get_user)) -> dict:
    rows = [p for p in DB.projects.all() if user["id"] in (p.get("members") or []) or p.get("owner_id") == user["id"]]
    return {"workspaces": [slim_project(p, user) for p in rows]}


@api.post("/workspaces")
def create_workspace(payload: dict = Body(...), user: dict = Depends(get_user)) -> dict:
    plan = PLANS.get(user.get("plan", "free"), PLANS["free"])
    limit = plan.get("projects")
    existing = [p for p in DB.projects.all() if p.get("owner_id") == user["id"]]
    if limit and len(existing) >= limit:
        raise HTTPException(402, f"The {plan['name']} plan allows {limit} projects. Upgrade to add more.")
    p = {"id": new_id("ws"), "name": payload.get("name") or "Untitled workspace", "owner_id": user["id"],
         "members": [user["id"]], "plan": user.get("plan", "free"),
         "color": payload.get("color") or "#7c5cff", "created_at": now(),
         "channels": payload.get("channels") or ["blog"],
         "brand_voice": {"tone": payload.get("tone") or "professional", "avoid": ["delve", "seamless"],
                         "audience": payload.get("audience") or "your customers", "reading_level": 60,
                         "voice_notes": ""}}
    DB.projects.insert(p)
    return {"workspace": slim_project(p, user)}


@api.patch("/workspaces/{ws_id}")
def patch_workspace(ws_id: str, payload: dict = Body(...), user: dict = Depends(get_user)) -> dict:
    p = DB.projects.first(id=ws_id)
    if not p:
        raise HTTPException(404, "Workspace not found")
    patch = {k: v for k, v in payload.items() if k in ("name", "color", "channels", "brand_voice")}
    if "brand_voice" in patch and isinstance(patch["brand_voice"], dict):
        patch["brand_voice"] = {**(p.get("brand_voice") or {}), **patch["brand_voice"]}
    updated = DB.projects.update(ws_id, patch) or p
    return {"workspace": slim_project(updated, user)}


@api.delete("/workspaces/{ws_id}")
def delete_workspace(ws_id: str, user: dict = Depends(get_user)) -> dict:
    p = DB.projects.first(id=ws_id)
    if not p:
        raise HTTPException(404, "Workspace not found")
    if p.get("owner_id") != user["id"]:
        raise HTTPException(403, "Only the workspace owner can delete it")
    for d in DB.documents.find(workspace_id=ws_id):
        DB.documents.delete(d["id"])
    DB.projects.delete(ws_id)
    return {"deleted": ws_id}


# ---------------------------------------------------------------------------- generation
def _charge(user: dict, workspace_id: str, feature: str, credits: int, words: int, latency: int,
            action: str = "generate") -> None:
    plan = PLANS.get(user.get("plan", "free"), PLANS["free"])
    quota = plan["credits_monthly"]
    used = int(user.get("credits_used", 0))
    if used + credits > quota and plan["id"] != "enterprise":
        raise HTTPException(402, f"Out of credits on the {plan['name']} plan "
                                f"({used:,}/{quota:,} used). Upgrade or wait for the reset.")
    DB.users.update(user["id"], {"credits_used": used + credits})
    user["credits_used"] = used + credits
    DB.events.insert({"id": new_id("evt"), "user_id": user["id"], "workspace_id": workspace_id,
                      "feature": feature, "action": action, "credits": credits, "words": words,
                      "latency_ms": latency, "ts": now()})


@api.post("/generate/estimate")
def estimate(payload: dict = Body(...)) -> dict:
    kind = payload.get("kind") or "text"
    return engine.estimate(kind, payload)


@api.post("/generate")
def generate(payload: dict = Body(...), user: dict = Depends(get_user)) -> dict:
    kind = payload.get("kind") or "text"
    if kind == "image":
        raise HTTPException(400, "Use POST /api/generate/image for visuals")
    workspace_id = payload.get("workspace_id") or (DB.projects.all()[0] or {}).get("id")
    params = {k: v for k, v in payload.items() if k != "workspace_id"}
    params.setdefault("salt", uuid.uuid4().hex[:10])
    plan = PLANS.get(user.get("plan", "free"), PLANS["free"])
    brand = (DB.projects.first(id=workspace_id) or {}).get("name") or "Nebula Studio"
    bv = ((DB.projects.first(id=workspace_id) or {}).get("brand_voice") or {})
    params.setdefault("brand", brand)
    if not params.get("tone"):
        params["tone"] = bv.get("tone") or "professional"
    if bv.get("audience") and not payload.get("audience"):
        params["audience"] = bv["audience"]
    t0 = time.time()
    try:
        result = engine.run(kind, params)
    except ValueError as exc:
        raise HTTPException(422, str(exc)) from exc
    if result["meta"].get("error"):
        raise HTTPException(422, result["meta"]["error"])
    latency = int((time.time() - t0) * 1000) + 90
    credits = engine.CREDITS.get(kind, 3)
    _charge(user, workspace_id, kind, credits, result["engine"]["words_out"], latency)
    doc = {"id": new_id("doc"), "workspace_id": workspace_id, "user_id": user["id"], "kind": kind,
           "title": result["title"], "prompt": params.get("prompt") or "", "status": "draft",
           "content": result["content"], "meta": result["meta"], "engine": dict(result["engine"], live_ms=latency),
           "params": params, "pinned": False, "tags": [kind], "image": None,
           "word_count": result["meta"].get("word_count") or len(result["content"].split()),
           "created_at": now(), "updated_at": now()}
    DB.documents.insert(doc)
    account = public_user(DB.users.first(id=user["id"]) or user)
    return {"document": doc, "credits": account["credits"], "user": account,
            "plan_limit": plan["credits_monthly"]}


@api.post("/generate/image")
def generate_image(payload: dict = Body(...), user: dict = Depends(get_user)) -> dict:
    workspace_id = payload.get("workspace_id") or (DB.projects.all()[0] or {}).get("id")
    prompt = str(payload.get("prompt") or "").strip()
    if len(prompt) < 4:
        raise HTTPException(422, "Describe the image you want first")
    _charge(user, workspace_id, "image", 8, 0, 1250)
    asset = images.generate(prompt, payload.get("style") or "aurora", payload.get("ratio") or "1:1",
                            title=payload.get("title"), seed=uuid.uuid4().hex)
    doc = {"id": new_id("doc"), "workspace_id": workspace_id, "user_id": user["id"], "kind": "image",
           "title": nlp.title_case(nlp.topic_of(prompt)) + " — visual", "prompt": prompt, "status": "ready",
           "content": "![%s](%s)" % (prompt, asset["url"]), "meta": {"image": asset},
           "engine": {"model": "nebula-image-1", "credits": 8, "mode": "local-engine",
                      "latency_ms": 1250, "words_out": 0},
           "params": payload, "pinned": False, "tags": ["image", asset["style"]], "image": asset,
           "word_count": 0, "created_at": now(), "updated_at": now()}
    DB.documents.insert(doc)
    account = public_user(DB.users.first(id=user["id"]) or user)
    return {"image": asset, "document": doc, "credits": account["credits"], "user": account}


# ---------------------------------------------------------------------------- documents
@api.get("/documents")
def list_documents(workspace_id: str | None = None, kind: str | None = None, q: str | None = None,
                   limit: int = 60, user: dict = Depends(get_user)) -> dict:
    rows = DB.documents.all()
    mine = {p["id"] for p in DB.projects.all() if user["id"] in (p.get("members") or []) or p.get("owner_id") == user["id"]}
    rows = [r for r in rows if r.get("workspace_id") in mine]
    if workspace_id:
        rows = [r for r in rows if r.get("workspace_id") == workspace_id]
    if kind:
        rows = [r for r in rows if r.get("kind") == kind]
    if q:
        needle = q.lower()
        rows = [r for r in rows if needle in (str(r.get("title", "")) + " " + str(r.get("content", ""))[:4000]).lower()]
    rows = sorted(rows, key=lambda r: r.get("created_at", 0), reverse=True)[:limit]
    return {"documents": [_slim_doc(r) for r in rows], "total": len(rows)}


def _slim_doc(r: dict) -> dict:
    return {k: r.get(k) for k in ("id", "workspace_id", "user_id", "kind", "title", "prompt", "status",
                                   "created_at", "updated_at", "pinned", "tags", "image", "word_count",
                                   "meta", "engine", "params")}


@api.get("/documents/{doc_id}")
def get_document(doc_id: str, user: dict = Depends(get_user)) -> dict:
    doc = DB.documents.first(id=doc_id)
    if not doc:
        raise HTTPException(404, "Document not found")
    return {"document": doc}


@api.patch("/documents/{doc_id}")
def patch_document(doc_id: str, payload: dict = Body(...), user: dict = Depends(get_user)) -> dict:
    doc = DB.documents.first(id=doc_id)
    if not doc:
        raise HTTPException(404, "Document not found")
    patch = {k: v for k, v in payload.items() if k in ("title", "content", "status", "pinned", "tags")}
    if "content" in patch:
        patch["word_count"] = len(str(patch["content"]).split())
    updated = DB.documents.update(doc_id, patch) or doc
    return {"document": updated}


@api.delete("/documents/{doc_id}")
def delete_document(doc_id: str, user: dict = Depends(get_user)) -> dict:
    if not DB.documents.delete(doc_id):
        raise HTTPException(404, "Document not found")
    return {"deleted": doc_id}


@api.post("/documents")
def create_document(payload: dict = Body(...), user: dict = Depends(get_user)) -> dict:
    workspace_id = payload.get("workspace_id") or (DB.projects.all()[0] or {}).get("id")
    content = str(payload.get("content") or "")
    doc = {"id": new_id("doc"), "workspace_id": workspace_id, "user_id": user["id"],
           "kind": payload.get("kind") or "text",
           "title": payload.get("title") or nlp.title_case(nlp.topic_of(content[:160] or "Untitled")),
           "prompt": payload.get("prompt") or "", "status": "draft", "content": content,
           "meta": payload.get("meta") or {}, "engine": {"model": "manual", "credits": 0, "mode": "human"},
           "params": {}, "pinned": False, "tags": ["manual"], "image": None,
           "word_count": len(content.split()), "created_at": now(), "updated_at": now()}
    DB.documents.insert(doc)
    return {"document": doc}


@api.post("/documents/{doc_id}/save-prompt")
def save_prompt_from_doc(doc_id: str, payload: dict = Body(default={}), user: dict = Depends(get_user)) -> dict:
    doc = DB.documents.first(id=doc_id)
    if not doc:
        raise HTTPException(404, "Document not found")
    body = (doc.get("params") or {}).get("prompt") or doc.get("prompt") or doc.get("title") or ""
    prompt = {"id": new_id("prm"), "workspace_id": doc.get("workspace_id"), "author": user.get("name"),
              "title": payload.get("title") or ("Saved: " + str(doc.get("title"))[:48]),
              "category": (doc.get("kind") or "text").title(), "model": (doc.get("engine") or {}).get("model", ""),
              "rating": 0.0, "uses": 0, "saved_from": doc_id, "created_at": now(),
              "body": payload.get("body") or str(body)}
    DB.prompts.insert(prompt)
    return {"prompt": prompt}


# ---------------------------------------------------------------------------- templates & prompts
@api.get("/templates")
def list_templates(category: str | None = None, q: str | None = None) -> dict:
    rows = DB.templates.all()
    if category and category != "All":
        rows = [r for r in rows if r.get("category") == category]
    if q:
        rows = [r for r in rows if q.lower() in json.dumps(r).lower()]
    rows = sorted(rows, key=lambda r: -int(r.get("uses", 0)))
    cats = sorted({r.get("category", "Other") for r in DB.templates.all()})
    return {"templates": rows, "categories": ["All"] + cats}


@api.post("/templates/{tpl_id}/use")
def use_template(tpl_id: str, workspace_id: str | None = None, user: dict = Depends(get_user)) -> dict:
    tpl = DB.templates.first(id=tpl_id)
    if not tpl:
        raise HTTPException(404, "Template not found")
    DB.templates.update(tpl_id, {"uses": int(tpl.get("uses", 0)) + 1})
    return {"params": {**(tpl.get("params") or {}), "kind": tpl.get("kind"), "workspace_id": workspace_id},
            "template": tpl}


@api.get("/prompts")
def list_prompts(q: str | None = None, category: str | None = None) -> dict:
    rows = DB.prompts.all()
    if category and category != "All":
        rows = [r for r in rows if r.get("category") == category]
    if q:
        rows = [r for r in rows if q.lower() in json.dumps(r).lower()]
    rows = sorted(rows, key=lambda r: -int(r.get("uses", 0)))
    return {"prompts": rows, "categories": ["All"] + sorted({r.get("category", "Other") for r in DB.prompts.all()})}


@api.post("/prompts")
def create_prompt(payload: dict = Body(...), user: dict = Depends(get_user)) -> dict:
    if not str(payload.get("body", "")).strip():
        raise HTTPException(422, "Prompt body is empty")
    p = {"id": new_id("prm"), "workspace_id": payload.get("workspace_id"), "author": user.get("name"),
         "title": payload.get("title") or "Untitled prompt", "category": payload.get("category") or "Custom",
         "model": payload.get("model") or "", "rating": 0.0, "uses": 0, "saved_from": None,
         "body": payload.get("body"), "created_at": now()}
    DB.prompts.insert(p)
    return {"prompt": p}


@api.delete("/prompts/{prompt_id}")
def delete_prompt(prompt_id: str, user: dict = Depends(get_user)) -> dict:
    if not DB.prompts.delete(prompt_id):
        raise HTTPException(404, "Prompt not found")
    return {"deleted": prompt_id}


@api.post("/prompts/{prompt_id}/run")
def run_prompt(prompt_id: str, payload: dict = Body(default={}), user: dict = Depends(get_user)) -> dict:
    p = DB.prompts.first(id=prompt_id)
    if not p:
        raise HTTPException(404, "Prompt not found")
    DB.prompts.update(prompt_id, {"uses": int(p.get("uses", 0)) + 1})
    kind = {"Blog": "blog", "Editing": "rewrite", "Social": "caption", "SEO": "seo", "QA": "analyze",
            "Email": "text", "Repurpose": "rewrite", "Image": "image", "Ops": "summarize",
            "Video": "text", "Ads": "text"}.get(p.get("category"), "text")
    filled = str(p.get("body", ""))
    for key, val in (payload.get("vars") or {}).items():
        filled = filled.replace("{" + str(key) + "}", str(val))
    filled = re.sub(r"\{[a-z_]+\}", "", filled)
    # a variable left blank should not strand its connector: "write for ." -> "write."
    filled = re.sub(r"[ \t]+(?:for|to|about|on|with|in|using|as)[ \t]+(?=[.,!?:;])", "", filled)
    filled = re.sub(r"[ \t]{2,}", " ", filled).strip()
    return {"kind": kind, "prompt": filled, "vars_hint": re.findall(r"\{([a-z_]+)\}", str(p.get("body", "")))}


# ---------------------------------------------------------------------------- analytics
@api.get("/analytics/usage")
def usage(days: int = Query(30, ge=7, le=180), user: dict = Depends(get_user)) -> dict:
    start = now() - days * 86400
    evts = [e for e in DB.events.all() if e.get("ts", 0) >= start
            and (e.get("user_id") == user["id"] or e.get("workspace_id") in
                 {p["id"] for p in DB.projects.all() if user["id"] in (p.get("members") or [])})]
    buckets: dict[str, dict] = {}
    for e in evts:
        day = time.strftime("%Y-%m-%d", time.gmtime(e.get("ts", 0)))
        b = buckets.setdefault(day, {"date": day, "runs": 0, "credits": 0, "words": 0, "latency": 0,
                                     "images": 0, "docs": 0})
        b["runs"] += 1
        b["credits"] += int(e.get("credits", 0))
        b["words"] += int(e.get("words", 0))
        b["latency"] += int(e.get("latency_ms", 0))
        if e.get("feature") == "image":
            b["images"] += 1
        else:
            b["docs"] += 1
    series = []
    for i in range(days - 1, -1, -1):
        day = time.strftime("%Y-%m-%d", time.gmtime(now() - i * 86400))
        series.append(buckets.get(day, {"date": day, "runs": 0, "credits": 0, "words": 0,
                                        "latency": 0, "images": 0, "docs": 0}))
    per_feature: dict[str, dict] = {}
    for e in evts:
        f = e.get("feature", "other")
        row = per_feature.setdefault(f, {"feature": f, "runs": 0, "credits": 0, "words": 0, "latency": []})
        row["runs"] += 1
        row["credits"] += int(e.get("credits", 0))
        row["words"] += int(e.get("words", 0))
        row["latency"].append(int(e.get("latency_ms", 0)))
    features = []
    for f, row in per_feature.items():
        lat = row.pop("latency") or [0]
        row["avg_latency_ms"] = int(sum(lat) / len(lat))
        row["label"] = {"blog": "Blog / article", "text": "AI text", "caption": "Social captions",
                        "rewrite": "Rewriting", "summarize": "Summarization", "seo": "SEO briefs",
                        "analyze": "Analyzer", "image": "Images"}.get(f, f.title())
        row["hours_saved"] = round(row["words"] / 200 / 60, 1)  # 200 wpm human drafting benchmark
        features.append(row)
    features.sort(key=lambda r: -r["runs"])
    actions: dict[str, int] = {}
    for e in evts:
        actions[e.get("action", "other")] = actions.get(e.get("action", "other"), 0) + 1
    docs = [d for d in DB.documents.all() if d.get("created_at", 0) >= start]
    plan = PLANS.get(user.get("plan", "free"), PLANS["free"])
    used = int(user.get("credits_used", 0))
    return {
        "range_days": days,
        "series": series,
        "features": features,
        "actions": actions,
        "totals": {
            "runs": len(evts), "credits": sum(int(e.get("credits", 0)) for e in evts),
            "words": sum(int(e.get("words", 0)) for e in evts),
            "images": sum(1 for e in evts if e.get("feature") == "image"),
            "hours_saved": round(sum(int(e.get("words", 0)) for e in evts) / 200 / 60, 1),
            "documents": len(docs),
            "avg_latency_ms": int(sum(int(e.get("latency_ms", 0)) for e in evts) / max(1, len(evts))),
        },
        "credits": {"used": used, "quota": plan["credits_monthly"],
                    "remaining": max(0, plan["credits_monthly"] - used),
                    "pct": round(min(100, used / max(1, plan["credits_monthly"]) * 100), 1)},
        "recent": [{k: e.get(k) for k in ("feature", "action", "credits", "words", "ts")}
                   for e in sorted(evts, key=lambda x: -x.get("ts", 0))[:14]],
    }


@api.get("/analytics/export")
def analytics_csv(user: dict = Depends(get_user)) -> Response:
    buf = io.StringIO()
    writer = csv.writer(buf)
    writer.writerow(["timestamp", "iso", "user", "workspace", "feature", "action", "credits", "words", "latency_ms"])
    for e in sorted(DB.events.all(), key=lambda x: x.get("ts", 0)):
        writer.writerow([e.get("ts"), time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime(e.get("ts", 0))),
                         e.get("user_id"), e.get("workspace_id"), e.get("feature"), e.get("action"),
                         e.get("credits"), e.get("words"), e.get("latency_ms")])
    return Response(buf.getvalue(), media_type="text/csv",
                    headers={"Content-Disposition": 'attachment; filename="nebula-usage.csv"'})


# ---------------------------------------------------------------------------- billing
@api.get("/billing/plans")
def plans() -> dict:
    return {"plans": list(PLANS.values()), "currency": "USD",
            "entitlements_legend": {"credits_monthly": "model credits", "seats": "team members",
                                     "projects": "workspaces", "images_monthly": "generated images"}}


@api.get("/billing/subscription")
def subscription(user: dict = Depends(get_user)) -> dict:
    sub = DB.subscriptions.first(user_id=user["id"])
    plan = PLANS.get(user.get("plan", "free"), PLANS["free"])
    return {"subscription": sub, "plan": plan, "usage": public_user(user)["credits"],
            "invoices": [{"id": "inv_%04d" % (i + 1), "plan": plan["name"],
                          "amount": plan["price_yearly"] if (sub or {}).get("cycle") == "yearly" else plan["price_monthly"],
                          "status": "paid", "date": time.strftime("%Y-%m-%d", time.gmtime(now() - i * 30 * 86400))}
                         for i in range(4 if plan["price_monthly"] else 0)]}


@api.post("/billing/subscribe")
def subscribe(payload: dict = Body(...), user: dict = Depends(get_user)) -> dict:
    sub = auth.subscribe(user, payload.get("plan_id") or "free", payload.get("cycle") or "monthly")
    fresh = DB.users.first(id=user["id"]) or user
    return {"subscription": sub, "user": public_user(fresh)}


@api.post("/billing/cancel")
def cancel(user: dict = Depends(get_user)) -> dict:
    sub = DB.subscriptions.first(user_id=user["id"])
    if sub:
        DB.subscriptions.update(sub["id"], {"status": "canceled_at_period_end"})
    return {"ok": True}


# ---------------------------------------------------------------------------- export
@api.get("/export/{doc_id}")
def export(doc_id: str, format: str = Query("md"), user: dict = Depends(get_user)):
    doc = DB.documents.first(id=doc_id)
    if not doc:
        raise HTTPException(404, "Document not found")
    fmt = format.lower()
    title = str(doc.get("title") or "Untitled")
    slug = re.sub(r"[^a-z0-9]+", "-", title.lower()).strip("-")[:60] or "document"
    meta = dict((doc.get("meta") or {}))
    meta = {k: v for k, v in meta.items() if isinstance(v, (int, float, str))}
    if fmt in ("md", "markdown"):
        body = f"# {title}\n\n{doc.get('content','')}\n"
        return Response(body, media_type="text/markdown",
                        headers={"Content-Disposition": f'attachment; filename="{slug}.md"'})
    if fmt == "html":
        return Response(markdown.document_html(title, doc.get("content", ""), meta), media_type="text/html",
                        headers={"Content-Disposition": f'attachment; filename="{slug}.html"'})
    if fmt == "txt":
        return PlainTextResponse(nlp.strip_md(doc.get("content", "")),
                                 headers={"Content-Disposition": f'attachment; filename="{slug}.txt"'})
    if fmt == "json":
        return Response(json.dumps({"document": doc}, indent=2, default=str), media_type="application/json",
                        headers={"Content-Disposition": f'attachment; filename="{slug}.json"'})
    if fmt == "csv":
        rows = (doc.get("meta") or {}).get("keywords") or []
        buf = io.StringIO()
        writer = csv.writer(buf)
        if rows and isinstance(rows[0], dict):
            writer.writerow(list(rows[0].keys()))
            for r in rows:
                writer.writerow([r.get(k, "") for k in rows[0].keys()])
        else:
            writer.writerow(["field", "value"])
            for k, v in meta.items():
                writer.writerow([k, v])
        return Response(buf.getvalue(), media_type="text/csv",
                        headers={"Content-Disposition": f'attachment; filename="{slug}.csv"'})
    raise HTTPException(400, f"Unsupported export format '{format}'")


@api.post("/export/batch")
def export_batch(payload: dict = Body(...), user: dict = Depends(get_user)) -> dict:
    ids = payload.get("ids") or []
    fmt = (payload.get("format") or "md").lower()
    chunks = []
    for doc_id in ids:
        doc = DB.documents.first(id=doc_id)
        if not doc:
            continue
        body = doc.get("content", "")
        if fmt == "html":
            chunks.append(markdown.to_html(body))
        elif fmt == "json":
            chunks.append(json.dumps({"id": doc["id"], "title": doc.get("title"), "kind": doc.get("kind"),
                                      "meta": doc.get("meta")}, default=str))
        elif fmt == "txt":
            chunks.append(nlp.strip_md(body))
        else:
            chunks.append(f"# {doc.get('title')}\n\n{body}")
    joiner = "\n\n<hr>\n\n" if fmt == "html" else ("\n\n---\n\n" if fmt == "md" else "\n")
    return {"count": len(chunks), "format": fmt, "body": joiner.join(chunks),
            "filename": f"nebula-batch-{now()}.{fmt if fmt != 'markdown' else 'md'}"}


# ---------------------------------------------------------------------------- media
@media_api.get("/media/images/{name}")
def media_image(name: str) -> Response:
    path = (images.MEDIA_DIR / name).resolve()
    if not str(path).startswith(str(images.MEDIA_DIR.resolve())) or not path.exists():
        raise HTTPException(404, "Asset not found")
    return Response(path.read_text(), media_type="image/svg+xml",
                    headers={"Cache-Control": "public, max-age=31536000, immutable"})
