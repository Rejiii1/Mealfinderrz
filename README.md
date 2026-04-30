# MealFinderrz

A family meal planner with a shared calendar, dish library, and auto-generated
grocery list. Installable PWA, optimized for iPhone.

## Features

- Shared calendar — one tap to plan dinner for any day
- Dish library with ingredients and tags, filterable and searchable
- Auto-generated grocery list rolled up from the meals you've planned
- Multi-user families with 6-character invite codes
- Cookie-session auth (no third-party identity provider)
- Works offline (service-worker app shell + cached API responses)
- Light / dark mode based on system preference

## Architecture

Single-process Node/Express server. State lives in a JSON file at `data/db.json`
written atomically through a single-writer mutex. Frontend is plain ES modules
(no bundler), an iPhone-tuned design system in `styles.css`, and a tiny service
worker for offline.

```
server.js        Express app + cookie-session + JSON-file store
sw.js            Service worker (network-first nav, SWR for assets)
app.js           Shared client utilities (api, toast, modal, escapeHtml…)
script.js        Calendar page
dishes.js        Dish library page
grocery.js       Grocery list page
family.html      Settings / family / account page (inline module)
*.html           One page per route
styles.css       Design system (light + dark)
```

## Run locally

```bash
npm install
npm start         # server on http://localhost:3000
```

The first request initialises `data/db.json`. Sign in via `/register` and
either create a family or join one with an invite code.

## Deploy via Docker

```bash
docker build -t mealfinderrz .
docker run -p 3000:3000 -v $(pwd)/data:/app/data \
    -e NODE_ENV=production \
    -e SESSION_SECRET=$(openssl rand -hex 32) \
    mealfinderrz
```

The shipped image:
- runs as the `node` user, behind `tini` for proper signal handling
- ships a HEALTHCHECK that pings `/api/auth/me`
- writes data only inside the `/app/data` volume

In production behind a TLS-terminating reverse proxy (nginx, Caddy, NPM, etc.)
the server enables HSTS + secure cookies via `NODE_ENV=production`.

## CI / publish

`.github/workflows/docker-publish.yml` builds and pushes
`ghcr.io/<owner>/mealfinderrz:latest` on every push to `main`.

## Security notes

- Session cookies are HTTP-only, SameSite=Lax, and Secure in production.
- Auth endpoints (`/api/auth/{login,register}`) are rate-limited to 20 req per
  IP per 15 minutes.
- All mutating routes go through a single-writer mutex to avoid TOCTOU races.
- Strict CSP, X-Frame-Options: DENY, X-Content-Type-Options: nosniff, and HSTS
  in production.
- Username matching is case-insensitive; passwords always run through bcrypt
  (even for unknown users) to neutralise timing-based username enumeration.
