# Nebula Studio — AI Content Creation Studio

An AI content platform you can actually click through: a marketing site plus a working
studio app where every feature is wired to a real FastAPI backend. Text, long-form
articles, social captions, images, rewrites, summaries, SEO briefs and an **AI content
analyzer** all generate, save, export, bill credits and show up in analytics.

Everything runs locally with **zero API keys** — no network calls, no rate limits, no
secrets to paste. The generator is a deterministic pure-Python engine (see
[The engine](#the-engine)), and the image renderer draws real SVG art. Swap either for a
hosted model when you have keys.

```
React + Vite SPA  ──/api proxy──▶  FastAPI  ──▶  content engine + image renderer
      │                              │
   tokens in localStorage            └──▶ JSON document store (.data/studio.json)
```

## Run it

Two processes (both already bound to `0.0.0.0` for previewing):

```bash
# 1. API  → http://127.0.0.1:8000/docs
cd api && pip install -r requirements.txt && uvicorn app.main:app --reload --host 0.0.0.0 --port 8000

# 2. Web  → http://localhost:5173
cd web && npm install && npm run dev
```

`npm run build` emits `web/dist` (≈336 kB JS / 100 kB gzipped, 30 kB CSS) which you can
serve behind the same host as the API. The Vite dev server proxies `/api` and `/media`,
so the SPA only ever uses relative URLs — no CORS, no localhost hardcoding.

**Demo login:** `demo@nebula.studio` / `demo1234`, or one click on *Continue with the demo
workspace*. It signs you into a seeded workspace: 2 projects, 14 documents, 169 usage
events, Pro plan with a partially-used credit balance. `POST /api/demo/reset` (or
Settings → Sandbox data → Reset demo data) restores that factory state at any time.

## What's in it

| Area | Where | What works |
| --- | --- | --- |
| AI text generation | `/app/create/text` | 5 copy types (email, ad, product, script, announcement) × 6 tones, 4 lengths, audience, keywords |
| Blog / article generation | `/app/create/blog` | outline, H2/H3 sections, meta title + description, read time, FAQ |
| Social captions | `/app/create/caption` | variants for 7 platforms with hashtag sets, char-limit meters, best-time hints |
| Image generation | `/app/create/image` | 6 art styles × 5 ratios, SVG → PNG download, palette extraction |
| Content rewriting | `/app/create/rewrite` | tone / concise / plain-language / expand, with a before-after change log |
| Summarization | `/app/create/summarize` | TL;DR, key points, word compression ratio |
| SEO keyword suggestions | `/app/create/seo` | scored keyword set, primary pick, SERP preview, content questions |
| Content analyzer | `/app/create/analyze` + live on the landing page | AI-tell probability, burstiness, lexical diversity, Flesch readability, tone/sentiment, structure audit, prioritised fix list, projected score after fixes |
| Templates | `/app/templates` | 14 seeded templates + category filters, *Use* seeds the composer |
| Prompt library | `/app/prompts` | 10 seeded prompts, variable chips (`{topic}`), run-into-composer, save-any-draft-as-prompt |
| Projects / workspaces | `/app/settings` | create, rename, accent colour, channels, brand voice, member seats, switch, delete |
| Generation history | `/app/documents` | search, kind filters, sort, pin, batch export, per-document parameters |
| Export | any document | Markdown, HTML (styled, printable), TXT, JSON, plus CSV for analytics and batch |
| Auth | `/signin`, `/signup` | register/login (PBKDF2 + salted tokens), one-click demo, guarded routes, `?next=` redirects |
| Usage analytics | `/app/analytics` | runs/words/credits/hours-saved KPIs, daily series, per-feature breakdown, donut mix, CSV export |
| Subscription-ready billing | `/app/billing` | plans, monthly/yearly, upgrade/downgrade, invoices, cancel-at-period-end, credit meter + 402 handling |

The landing page (`/`) is not a static mockup: the analyzer widget, the usage chart and
the image previews are fetched from the same running API.

## API surface

All REST, JSON, `Authorization: Bearer <token>` (soft-auth: unauthenticated calls fall
back to the demo account so the preview never dead-ends). Full OpenAPI at `/docs`.

```
GET  /api/health · /api/meta                POST /api/auth/register|login|demo · GET /api/me
GET  /api/workspaces      POST/PATCH/DELETE /api/workspaces/{id}
POST /api/generate        POST /api/generate/estimate      POST /api/generate/image
GET  /api/documents?workspace_id&kind&q&limit   GET/PATCH/DELETE /api/documents/{id}
POST /api/documents       POST /api/documents/{id}/save-prompt
GET  /api/templates?category&q              POST /api/templates/{id}/use
GET  /api/prompts         POST /api/prompts  DELETE /api/prompts/{id}  POST /api/prompts/{id}/run
GET  /api/analytics/usage?days=30           GET /api/analytics/export        (CSV)
GET  /api/billing/plans|subscription        POST /api/billing/subscribe|cancel
GET  /api/export/{doc_id}?format=md|html|txt|json|csv   POST /api/export/batch
GET  /api/preview/image?style&ratio&prompt  GET /media/images/{name}
POST /api/demo/reset
```

Errors are plain: `402` insufficient credits (the UI turns this into an upgrade path),
`422` prompt/source too short or unknown kind, `404` missing id.

## The engine

`api/app/engine.py` — `run(kind, params) -> {kind, title, content, meta, engine}`.
`content` is Markdown; `meta` carries the per-feature structures the UI renders (score
breakdowns, caption variants, keyword sets, change logs). `engine` records the model
alias, credits charged, latency, word count, temperature and seed, so every document can
show exactly how it was made.

It is deterministic: same params + salt ⇒ same output. Vocabulary, sentence rhythm,
numbers and section choices derive from the prompt hash, so repeated runs vary but are
reproducible — which is why the analyzer produces honest scores (run it on its own blog
output and it will flag the seams; that is the point of the feature).

To wire a hosted model, keep the contract and replace the body of `run()`:

```python
# engine.py
def run(kind, params):
    resp = openai.chat.completions.create(model=MODEL_BY_KIND[kind], ...)   # or Anthropic/Gemini
    return {"kind": kind, "title": ..., "content": resp.choices[0].message.content,
            "meta": parse_meta(kind, resp), "engine": {...}}
```

Nothing in the routes, the store or the UI changes: they consume the contract, not the
generator.

## Architecture notes & swap paths

- **Store** (`api/app/db.py`): one file-backed document store with a collection API
  (`all / find / first / insert / update / delete / replace_all`). It is deliberately
  shaped like a thin ORM, so moving to PostgreSQL is a `db.py` swap: `SQLAlchemy` models
  per collection, `find(**match)` → `select().filter_by(**match)`. `requirements.txt`
  carries the matching optional pins (`sqlalchemy`, `psycopg2-binary`) as commented lines.
- **Auth** (`api/app/auth.py`): PBKDF2-SHA256 password hashing and opaque bearer tokens in
  a `sessions` table. For Firebase, delete `register`/`login`/`get_user`'s token lookup and
  verify the client's Firebase ID token in the dependency instead — `public_user()` and
  every route downstream stay as they are.
- **Billing**: plans, credits and invoices are first-class records, and generation charges
  through one `_charge()` helper. Point that at Stripe (checkout + webhook writing
  `subscriptions`) and the UI needs no changes; `/api/billing/*` is the seam.
- **Images** (`api/app/images.py`): returns `{id, url, width, height, palette}`. Replace the
  SVG writer with a DALL·E/SDXL/Flux call that persists to the same folder or a bucket URL.
- **Runtime state** is everything the app writes — `.data/studio.json`, `.data/media/images/*.svg`,
  `.data/jwt.secret` — all gitignored, all recreated by the seeder on a cold boot.
- **CORS** is wide open for the preview; lock `allow_origins` to your domain in production.
- **Rate limiting / caching** are absent by design — behind a real provider, add them to
  `/api/generate*` and cache `/api/preview/image` (it already sends a 1-day `max-age`).

## Frontend structure

```
web/src
  main.jsx            providers, router, toast host
  App.jsx             routes + RequireAuth
  lib/api.js          typed-ish fetch client, downloads, clipboard, svg→png, formatters
  lib/store.jsx       StudioProvider: session, credits, workspaces, /api/meta dictionaries
  components/         Icon set, ui primitives (Modal, Segmented, Meter, Sparkline,
                      BarSeries, Donut, ScoreRing, Empty, toasts), Markdown renderer,
                      SiteChrome (marketing nav/footer)
  pages/              Landing, Features, Pricing, Auth
  pages/app/          Shell, Dashboard, Studio, Documents, DocumentView,
                      Templates, Prompts, Analytics, Billing, Settings
  styles/global.css   the whole design system: tokens, components, breakpoints
```

Charts are hand-drawn SVG (no chart dependency), icons are hand-drawn paths (no icon
package), and markdown is rendered by a small local parser — the only runtime
dependencies are React, ReactDOM and react-router.

Dark, editorial theme: Sora for display, Inter for UI, JetBrains Mono for numbers, violet
`#7c5cff` → cyan `#22d3ee` accents, generous `prefers-reduced-motion` support, keyboard
shortcuts (`⌘K` search, `⌘J` new generation, `⌘⏎` generate, `?` for the list) and
print styles that turn any document view into a clean handout.

## Tests

```bash
cd web
npm run lint          # eslint (flat config): no-undef, react-hooks rules-of-hooks/exhaustive-deps
npm run build
npm run test:routes   # 16 routes × expected copy, rendered in jsdom against the live API
npm run test:flows    # clicks: every generator, analyzer, exports, billing, workspace
                      # switching, command palette, sandbox reset
npm run test:flows2   # registration, settings persistence, pin/batch export, document
                      # editor, template + prompt handoff, analytics toggles, 402 upgrade path
npm run test:a11y     # accessible names, alt text, labels, heading order, landmarks, dup ids
npm run test:links    # every internal link → a router route; every /api path → OpenAPI
npm run test:dev      # dev bundle only: React warnings (keys, DOM nesting, controlled
                      # inputs) plus a StrictMode probe of the one-shot composer handoff
```

The harnesses bundle `src/main.jsx` with esbuild, mount it in jsdom and proxy `fetch` to
`http://127.0.0.1:8000`, so they fail on real runtime errors — uncaught exceptions,
`console.error`, missing data, 500s — rather than on snapshots. They also read the DOM the
same way a user does, which is how the template→composer handoff and the workspace-scoped
search were caught and fixed. The API surface was additionally swept with `curl` over
every endpoint listed above.

Note: `eslint-plugin-react` and `eslint-plugin-jsx-a11y` are installed but pinned to the
ESLint 8 API, so they are not enabled in `eslint.config.js`; the equivalent checks live in
`scripts/a11y.mjs` instead.

`npm test` runs the whole set. `test:dev` builds with `NODE_ENV=development` on purpose:
that is the only mode where React reports invalid nesting and where StrictMode
double-invokes renders, which is what catches side effects hiding in a render (the
template handoff originally consumed `sessionStorage` from a `useState` initializer —
correct in the production bundle, broken under StrictMode).

## Production checklist for this codebase

1. `db.py` → Postgres; addAlembic migrations; keep `DB.*` call sites untouched.
2. `auth.py` → Firebase (or Auth.js) token verification; drop the demo soft-auth fallback.
3. `_charge` → Stripe metered billing; `subscribe/cancel` → Checkout + customer portal.
4. `engine.run` → provider SDKs, with a queue (Celery/RQ) for long-form and images, and
   SSE/WebSocket instead of the client-side typewriter.
5. Point `STUDIO_DATA_DIR` (or an object store) somewhere persistent for the JSON file + generated media,
   put the SPA behind a CDN, tighten CORS.
