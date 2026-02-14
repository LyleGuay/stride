# Hosting & Infrastructure

## Overview

Single Railway service hosts both the Go API and the built SPA. Neon provides a managed PostgreSQL database on the free tier. Cloudflare handles DNS.

## Stack

| Component | Service | Plan | Cost |
|-----------|---------|------|------|
| Go API + SPA | [Railway](https://railway.com) | Hobby | ~$5/mo |
| PostgreSQL | [Neon](https://neon.com) | Free | $0 |
| DNS/Domain | Cloudflare | Free | $0 |

## How It Works

The Go API serves the built React SPA as static files, so only one Railway service is needed. In production, the SPA and API share the same origin — no CORS or proxy configuration required.

**Build flow:**
1. Build the web client (`npm run build` in `web-client/`) producing `dist/`
2. Build the Go binary, embedding or referencing the built static files
3. Deploy the single binary/container to Railway

## Railway

- Go binary is lightweight on CPU/memory, so the $5/mo credit should cover a low-traffic hobby app
- Supports custom domains — add a CNAME in Cloudflare pointing to Railway's provided domain
- If using Cloudflare's orange-cloud proxy, set SSL mode to **Full** to avoid redirect loops

## Neon

- Free tier: 0.5 GB storage, 100 compute-hours/month, scales to zero when idle
- Structured calorie/habit data is small — 0.5 GB is plenty for a long time
- Connection string goes in the `DB_URL` env var on Railway

## Cloudflare

- DNS only — CNAME record pointing to Railway
- Optional: enable proxy (orange cloud) for CDN/DDoS protection, but set SSL to Full
