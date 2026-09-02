"""Template + prompt library and demo dataset.

Seeding runs once (when the JSON store is empty) so a fresh clone opens a
workspace that already has history, analytics and exports to look at.
"""
from __future__ import annotations

import time

from . import auth, engine, images
from .db import DB, new_id, now

DAY = 86400

TEMPLATES = [
    {"name": "Long-form SEO article", "kind": "blog", "category": "Blog", "accent": "violet",
     "description": "900-word article with outline, FAQ and meta description, ready for the CMS.",
     "fields": ["prompt", "audience", "keywords"], "params": {"length": "long", "tone": "professional"},
     "uses": 1841, "time_saved_min": 95},
    {"name": "Skyscraper pillar page", "kind": "blog", "category": "Blog", "accent": "cyan",
     "description": "Sectioned pillar page with internal-link anchors and a comparison table.",
     "fields": ["prompt", "keywords"], "params": {"length": "epic", "tone": "professional"},
     "uses": 612, "time_saved_min": 180},
    {"name": "Case study outline", "kind": "blog", "category": "Sales", "accent": "amber",
     "description": "Problem → intervention → numbers, with pull-quotes you can hand to design.",
     "fields": ["prompt", "audience"], "params": {"length": "long", "tone": "professional"},
     "uses": 408, "time_saved_min": 70},
    {"name": "LinkedIn authority post", "kind": "caption", "category": "Social", "accent": "blue",
     "description": "Contrarian opener, short lines, no emoji, 3 hashtags, best-time suggestion.",
     "fields": ["prompt"], "params": {"platforms": ["linkedin"], "tone": "bold"},
     "uses": 2960, "time_saved_min": 25},
    {"name": "Launch thread (X + Threads)", "kind": "caption", "category": "Social", "accent": "pink",
     "description": "Character-safe posts for short-form platforms with a hard length ceiling.",
     "fields": ["prompt"], "params": {"platforms": ["x", "threads"], "tone": "witty"},
     "uses": 1223, "time_saved_min": 20},
    {"name": "Repost engine", "kind": "rewrite", "category": "Repurpose", "accent": "green",
     "description": "Turn one article into three platform-native posts without repeating yourself.",
     "fields": ["source", "tone"], "params": {"mode": "tone", "tone": "casual"},
     "uses": 866, "time_saved_min": 35},
    {"name": "Plain-language pass", "kind": "rewrite", "category": "Editing", "accent": "cyan",
     "description": "Corporate → human. Kills hedges, swaps jargon, shows every change made.",
     "fields": ["source"], "params": {"mode": "simplify", "tone": "friendly"},
     "uses": 1490, "time_saved_min": 30},
    {"name": "TL;DR for executives", "kind": "summarize", "category": "Editing", "accent": "amber",
     "description": "Three scored sentences, action items and the compression ratio.",
     "fields": ["source"], "params": {"length": "short"}, "uses": 744, "time_saved_min": 15},
    {"name": "Meeting notes → decisions", "kind": "summarize", "category": "Ops", "accent": "violet",
     "description": "Pull decisions and owners out of a raw transcript.",
     "fields": ["source"], "params": {"length": "medium"}, "uses": 519, "time_saved_min": 40},
    {"name": "Keyword gap brief", "kind": "seo", "category": "SEO", "accent": "green",
     "description": "24 expanded keywords with volume, difficulty, intent, plus meta title and H2 map.",
     "fields": ["prompt"], "params": {}, "uses": 1105, "time_saved_min": 85},
    {"name": "AI-detection health check", "kind": "analyze", "category": "QA", "accent": "pink",
     "description": "Readability, burstiness, AI-tell words and the fix list that follows.",
     "fields": ["source"], "params": {}, "uses": 2312, "time_saved_min": 20},
    {"name": "Lifecycle email", "kind": "text", "category": "Email", "accent": "blue",
     "description": "Subject, preview text and a 4-step body in your voice.",
     "fields": ["prompt", "audience"], "params": {"format": "email", "tone": "friendly", "length": "short"},
     "uses": 981, "time_saved_min": 25},
    {"name": "Paid social variants", "kind": "text", "category": "Ads", "accent": "amber",
     "description": "Hook, benefits and CTA sized for paid placements.",
     "fields": ["prompt"], "params": {"format": "ad", "tone": "urgent", "length": "short"},
     "uses": 1327, "time_saved_min": 20},
    {"name": "Reel script (60s)", "kind": "text", "category": "Video", "accent": "pink",
     "description": "Beat-sheet with timing marks for hook, problem, meat and CTA.",
     "fields": ["prompt"], "params": {"format": "script", "tone": "bold", "length": "short"},
     "uses": 604, "time_saved_min": 45},
]

PROMPTS = [
    {"title": "Brief-first article prompt", "category": "Blog", "model": "nebula-longform-3", "rating": 4.9, "uses": 3120,
     "body": "Write a {length}-word article about {topic} for {audience}. Lead with the operational cost, "
             "then a numbered workflow. Every section needs one number or one named tool. No adjectives "
             "that cannot be verified. Close with what to do this week."},
    {"title": "Anti-fluff rewrite instruction", "category": "Editing", "model": "nebula-edit-2", "rating": 4.8, "uses": 2455,
     "body": "Rewrite this so a tired reader at 11pm understands it in one pass. Cut hedges, split sentences "
             "over 26 words, replace abstract nouns with verbs, and keep every number."},
    {"title": "Platform-native caption", "category": "Social", "model": "nebula-social-2", "rating": 4.7, "uses": 2210,
     "body": "Write one caption per platform for {topic}. Each must start with a claim, not a scene-setter. "
             "LinkedIn: no emoji, 3 hashtags. X: under 240 characters. TikTok: spoken hook."},
    {"title": "SERP-gap keyword expansion", "category": "SEO", "model": "nebula-serp-1", "rating": 4.8, "uses": 1655,
     "body": "Expand {topic} into 20 keywords with intent labels. Group by journey stage. Flag anything I "
             "should not target because the SERP is dominated by vendors."},
    {"title": "Detection-safety pass", "category": "QA", "model": "nebula-insight-1", "rating": 4.6, "uses": 1502,
     "body": "Analyse this draft for AI tells: uniform sentence length, repeated openers, zero numbers. "
             "Return a fix list ordered by impact and rewrite the worst paragraph only."},
    {"title": "Repurpose from one asset", "category": "Repurpose", "model": "nebula-copy-2", "rating": 4.7, "uses": 1290,
     "body": "From the article below, produce: 1 newsletter intro, 3 X posts, 1 LinkedIn post, 1 YouTube "
             "description. Do not reuse a sentence verbatim across outputs."},
    {"title": "Product launch email", "category": "Email", "model": "nebula-copy-2", "rating": 4.5, "uses": 1101,
     "body": "Write a launch email to existing customers. One screenshotted benefit, no roadmap promises, "
             "one CTA, 130 words max."},
    {"title": "Comparison table builder", "category": "Blog", "model": "nebula-longform-3", "rating": 4.6, "uses": 890,
     "body": "Build a comparison table for {topic} with rows that a buyer can actually decide on: setup time, "
             "seats, export formats, model routing. Add a 'best for' column."},
    {"title": "Docs-to-FAQ distiller", "category": "Editing", "model": "nebula-edit-2", "rating": 4.5, "uses": 760,
     "body": "From these docs, write 6 FAQ pairs. Answers must be 35-45 words and cite the doc section."},
    {"title": "Campaign hero art direction", "category": "Image", "model": "nebula-image-1", "rating": 4.8, "uses": 1420,
     "body": "Generate a 4:5 campaign visual for {topic}: aurora palette, editorial typography, generous "
             "negative space, one accent line. No photorealism, no logos."},
]

DOC_SEEDS = [
    ("blog", "blog post about AI content workflows for lean marketing teams", {"tone": "professional", "length": "long"}, 1),
    ("analyze", "AI content analyzer", {"source": None}, 1),
    ("seo", "seo brief on b2b pricing page copy", {}, 2),
    ("caption", "product launch: one-click briefs", {"platforms": ["linkedin", "x", "instagram"], "tone": "bold"}, 2),
    ("text", "welcome email for new Nebula Studio subscribers", {"format": "email", "tone": "friendly"}, 3),
    ("blog", "how content repurposing cuts publishing cost", {"tone": "casual", "length": "medium"}, 6),
    ("rewrite", "plain-language pass on our onboarding docs", {"mode": "simplify", "tone": "friendly"}, 9),
    ("summarize", "quarterly content ops review", {"length": "short"}, 12),
    ("blog", "zero-click SEO and what it means for publishers", {"tone": "professional", "length": "long"}, 16),
    ("caption", "behind the scenes of our template library", {"platforms": ["instagram", "tiktok"], "tone": "witty"}, 21),
    ("seo", "content calendar template for agencies", {}, 26),
    ("text", "ad copy for our spring campaign", {"format": "ad", "tone": "urgent"}, 29),
]

DOC_TITLES = {
    "blog": "Draft", "text": "Copy", "caption": "Social set", "rewrite": "Rewrite",
    "summarize": "Summary", "seo": "SEO brief", "analyze": "Content report",
}


def seed(force: bool = False) -> dict:
    """Populate the store with a believable demo workspace.

    ``force=True`` wipes every collection first, so the demo can be returned to
    its factory state at any time (``POST /api/demo/reset``).
    """
    if DB.users.all() and not force:
        return {"seeded": False, "users": len(DB.users.all())}
    if force:
        DB.reset()
    ts = now()
    user = {"id": new_id("usr"), "email": auth.DEMO_EMAIL, "name": "Maya Okonkwo",
             "plan": "pro", "credits_used": 0, "created_at": ts - 92 * DAY,
             "avatar_hue": 262, "role": "Head of Content", "company": "Northbeam",
             "password": auth.hash_password(auth.DEMO_PASSWORD)}
    DB.users.insert(user)
    second = {"id": new_id("usr"), "email": "devon@northbeam.co", "name": "Devon Reyes",
              "plan": "pro", "credits_used": 0, "created_at": ts - 61 * DAY, "avatar_hue": 186,
              "role": "Content Lead", "company": "Northbeam", "password": auth.hash_password("demo1234")}
    DB.users.insert(second)
    auth.DB.subscriptions.insert({"id": new_id("sub"), "user_id": user["id"], "plan_id": "pro",
                                  "cycle": "yearly", "status": "active", "price": 290, "provider": "stripe (mock)",
                                  "started_at": ts - 61 * DAY, "renews_at": ts + 304 * DAY, "card_last4": 4242})

    ws = {"id": new_id("ws"), "name": "Northbeam Growth", "owner_id": user["id"],
          "members": [user["id"], second["id"]], "plan": "pro", "color": "#7c5cff",
          "created_at": ts - 90 * DAY,
          "brand_voice": {"tone": "confident", "avoid": ["delve", "seamless", "leverage", "unlock"],
                          "audience": "lean marketing teams", "banned_phrases": ["in today's fast-paced world"],
                          "reading_level": 60, "voice_notes": "Short sentences. One number per section. "
                                                               "No adjectives without evidence."},
          "channels": ["blog", "linkedin", "newsletter"]}
    ws2 = {"id": new_id("ws"), "name": "Personal brand", "owner_id": user["id"], "members": [user["id"]],
           "plan": "pro", "color": "#22d3ee", "created_at": ts - 40 * DAY,
           "brand_voice": {"tone": "witty", "avoid": ["game-changer"], "audience": "founders",
                           "reading_level": 55, "voice_notes": "First person, a little self-deprecating."},
           "channels": ["x", "instagram"]}
    DB.projects.insert(ws)
    DB.projects.insert(ws2)

    for t in TEMPLATES:
        DB.templates.insert({"id": new_id("tpl"), "workspace_id": ws["id"], "built_by": "Nebula",
                             "created_at": ts - 88 * DAY, **t})
    for p in PROMPTS:
        DB.prompts.insert({"id": new_id("prm"), "workspace_id": ws["id"], "author": "Maya O.",
                           "saved_from": None, "created_at": ts - 70 * DAY, **p})

    # documents: run the real engine so history, analytics and exports all have substance
    src_pool = {
        "rewrite": ("Most organisations utilise a variety of content channels to leverage their brand pillars. "
                    "It is important to note that in order to facilitate consistent publishing, teams must "
                    "prioritize a streamlined methodology. Due to the fact that resources are limited, it is "
                    "crucial to delve into the landscape of automation to unlock efficiency."),
        "summarize": ("The Q2 review covered output, quality and pipeline. Publishing rose from 6 to 19 pieces "
                      "per month while editorial headcount stayed flat at two. The AI draft pass cut "
                      "time-to-first-draft from 5.5 hours to 48 minutes. Two problems remain: review is a "
                      "single-threaded queue owned by Devon, and 40 percent of published pieces have no "
                      "conversion path. Legal blocked the pricing page rewrite twice because the source of "
                      "truth for numbers was unclear. Recommendation for Q3: add a reviewer rota, require a "
                      "CTA on every brief, and instrument assisted revenue. The team should ship the rota by "
                      "15 July and re-measure on 30 September. Budget stays flat; tooling spend increases by "
                      "$400 per month for credits."),
        "analyze": None,
    }
    for i, (kind, prompt, extra, days_ago) in enumerate(DOC_SEEDS):
        params = {"prompt": prompt, "salt": f"seed{i}", **extra}
        if kind in ("rewrite", "summarize", "analyze"):
            params["source"] = extra.get("source") or src_pool.get(kind) or prompt
        out = engine.run(kind, params)
        created = ts - days_ago * DAY - (i * 3600)
        img = None
        if kind in ("blog", "caption", "text") and i % 3 == 0:
            img = images.generate(prompt, ["aurora", "editorial", "neon", "terracotta"][i % 4],
                                  "16:9" if kind == "blog" else "1:1", title=None, seed=f"seedimg{i}")
        doc = {"id": new_id("doc"), "workspace_id": ws["id"], "user_id": user["id"], "kind": kind,
               "title": out["title"], "prompt": prompt, "status": "draft" if i % 5 == 0 else "ready",
               "content": out["content"], "meta": out["meta"], "engine": out["engine"],
               "params": params, "pinned": i in (0, 3), "tags": [kind, "seed"],
               "image": img, "created_at": created, "updated_at": created + 900,
               "word_count": out["meta"].get("word_count") or len(out["content"].split())}
        DB.documents.insert(doc)
        DB.events.insert({"id": new_id("evt"), "user_id": user["id"], "workspace_id": ws["id"],
                          "feature": kind, "action": "generate", "credits": out["engine"]["credits"],
                          "words": out["engine"]["words_out"], "latency_ms": out["engine"]["latency_ms"],
                          "ts": created})
        user["credits_used"] = user.get("credits_used", 0) + out["engine"]["credits"]
        if img:
            DB.events.insert({"id": new_id("evt"), "user_id": user["id"], "workspace_id": ws["id"],
                              "feature": "image", "action": "generate", "credits": 8, "words": 0,
                              "latency_ms": 1400 + i * 90, "ts": created + 60})
            user["credits_used"] += 8
        if i % 4 == 0:
            DB.events.insert({"id": new_id("evt"), "user_id": user["id"], "workspace_id": ws["id"],
                              "feature": kind, "action": "export", "credits": 0, "words": 0,
                              "latency_ms": 40, "ts": created + 300})
        if i % 3 == 1:
            DB.events.insert({"id": new_id("evt"), "user_id": second["id"], "workspace_id": ws["id"],
                              "feature": kind, "action": "review", "credits": 0, "words": 0,
                              "latency_ms": 0, "ts": created + 800})
    # a couple of docs in the second workspace
    for j, (kind, prompt) in enumerate([("caption", "thread about shipping in public"),
                                         ("analyze", "newsletter intro about hiring slow")]):
        out = engine.run(kind, {"prompt": prompt, "source": prompt, "platforms": ["x"], "salt": f"ws2-{j}"})
        DB.documents.insert({"id": new_id("doc"), "workspace_id": ws2["id"], "user_id": user["id"],
                             "kind": kind, "title": out["title"], "prompt": prompt, "status": "ready",
                             "content": out["content"], "meta": out["meta"], "engine": out["engine"],
                             "params": {}, "pinned": False, "tags": [kind], "image": None,
                             "created_at": ts - (3 + j) * DAY, "updated_at": ts - (3 + j) * DAY,
                             "word_count": len(out["content"].split())})
    # noise: make the analytics series look like real usage over 45 days
    for d in range(45):
        base = 6 + (d % 7 in (5, 6)) * -4 + (d // 9)
        for _ in range(max(0, base // 2)):
            feature = ["blog", "caption", "text", "seo", "analyze", "rewrite", "summarize", "image"][
                (d * 3 + _) % 8]
            DB.events.insert({"id": new_id("evt"), "user_id": user["id"], "workspace_id": ws["id"],
                              "feature": feature, "action": "generate",
                              "credits": engine.CREDITS.get(feature, 4),
                              "words": 200 + (d * 37 % 600), "latency_ms": 400 + (d * 53 % 1800),
                              "ts": ts - d * DAY - (_ * 700)})
            user["credits_used"] += engine.CREDITS.get(feature, 4)
    DB.users.update(user["id"], {"credits_used": min(user["credits_used"], 2380)})
    return {"seeded": True, "documents": len(DB.documents.all()), "events": len(DB.events.all())}
