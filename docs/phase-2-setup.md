# Phase 2A — Live Audit Intake Setup Guide

This guide covers deploying the Cloudflare Worker intake endpoint and wiring it to GitHub.

---

## Architecture Overview

```
User submits free-audit.html form
        ↓
POST /api/audit-request
        ↓
Cloudflare Worker (worker/audit-intake.js)
  ├─ Validates input
  ├─ Honeypot + rate limit check
  ├─ Generates request_id + timestamp
  └─ Forwards to GitHub:
        ├─ Option A: Create Issue in nothinginfinity/afo-site  (GITHUB_INTAKE_MODE=issue)
        └─ Option B: workflow_dispatch on audit-queue.yml     (GITHUB_INTAKE_MODE=dispatch)
                        ↓
              GitHub Actions (audit-queue.yml)
                ├─ Writes stub audit JSON to /data/audits/
                └─ Commits to main branch
```

**Recommended for Phase 2A:** `GITHUB_INTAKE_MODE=issue`
Issues are visible in the GitHub UI, easy to triage, and don't require workflow permissions for initial testing.

---

## Step 1 — Create a GitHub Fine-Grained PAT

1. Go to **GitHub → Settings → Developer settings → Personal access tokens → Fine-grained tokens**
2. Click **Generate new token**
3. Set:
   - **Repository access:** `nothinginfinity/afo-site` only
   - **Permissions:**
     - `Issues: Read and write` (for issue mode)
     - `Actions: Read and write` (for dispatch mode)
     - `Contents: Read and write` (for dispatch mode — Actions needs to commit)
4. Copy the token. You will not see it again.

---

## Step 2 — Add GitHub Token as a Worker Secret

Using Wrangler CLI:

```bash
cd worker
npx wrangler secret put GITHUB_TOKEN --config wrangler.toml
# Paste your token when prompted
```

Or via Cloudflare Dashboard:
- Workers & Pages → afo-audit-intake → Settings → Variables → Add variable
- Name: `GITHUB_TOKEN` | Type: Secret | Value: your PAT

---

## Step 3 — Deploy the Worker

```bash
# From repo root
npx wrangler deploy --config worker/wrangler.toml
```

The Worker will be available at:
`https://afo-audit-intake.<your-cf-subdomain>.workers.dev`

If you want it served at `/api/audit-request` on the same domain as the site,
configure a Route in the Cloudflare Dashboard or use Pages Functions (see Step 4).

---

## Step 4 — Route /api/audit-request to the Worker

### Option A: Cloudflare Pages Functions (recommended for same-domain)

Create `functions/api/audit-request.js` that imports and calls the Worker.
Or copy the Worker logic directly into a Pages Function.

### Option B: Worker Routes

In Cloudflare Dashboard → Workers & Pages → afo-audit-intake → Triggers → Add Route:
```
https://afo-site.jaredtechfit.workers.dev/api/*
```

### Option C: Separate subdomain

Deploy the Worker on its own subdomain:
`https://intake.afo-site.jaredtechfit.workers.dev/api/audit-request`

Then update `AUDIT_ENDPOINT` in `free-audit.html`.

---

## Step 5 — Add GitHub Actions Labels

The Worker creates issues with labels `audit-request` and `phase-2`.
Create these labels in the repo before going live:

```bash
gh label create "audit-request" --color "0075ca" --description "Incoming free audit request"
gh label create "phase-2" --color "e4e669" --description "Phase 2 audit intake"
```

---

## Step 6 — Test the Endpoint

```bash
curl -X POST https://YOUR_WORKER_URL/api/audit-request \
  -H "Content-Type: application/json" \
  -d '{
    "url": "https://test-business.example.com",
    "name": "Test Business",
    "email": "test@example.com",
    "category": "Testing"
  }'
```

Expected response:
```json
{
  "ok": true,
  "request_id": "afo-lp4k2x-a8f3c",
  "message": "Audit request received. You will be contacted within 24–48 hours."
}
```

A GitHub issue titled `[Audit Request] Test Business — https://test-business.example.com` should appear in the repo.

---

## Environment Variables Reference

| Variable | Required | Default | Description |
|---|---|---|---|
| `GITHUB_TOKEN` | **Yes** | — | Fine-grained PAT with issues:write or actions:write |
| `GITHUB_REPO` | No | `nothinginfinity/afo-site` | Target repo |
| `GITHUB_INTAKE_MODE` | No | `issue` | `issue` or `dispatch` |
| `ALLOWED_ORIGIN` | No | `*` | CORS allowed origin |
| `RATE_LIMIT_KV` | No | — | KV namespace binding for IP rate limiting |

---

## Degraded Mode (No Token Set)

If `GITHUB_TOKEN` is not configured, the Worker still returns a success response to the user. The request is logged in Worker console logs but not forwarded to GitHub. This ensures the public form never shows an error due to a missing secret.

---

## Phase 2B Roadmap (Next)

- GitHub Action: crawl the submitted URL and score AFO file presence
- Auto-generate a real audit JSON and report
- Commit results to `/data/audits/{request_id}.json`
- Optionally send an email with the dashboard link (Resend / SendGrid as notification layer)
