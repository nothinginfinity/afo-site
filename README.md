# AFO Site — Agent Feed Optimization Public Proof Site

Public proof site, landing page, dog-food demo, dashboard prototype, and free-audit funnel for **Agent Feed Optimization (AFO)**.

> "Make your website readable to AI."

---

## What This Repo Is

This is the static site for AFO — a system that adds an AI-readable business layer to websites so that AI assistants, LLM-powered search engines, and AI browsers can discover, understand, cite, and recommend them.

This site itself is a live AFO installation and proof-of-concept.

---

## Deploy on Cloudflare Pages

| Setting | Value |
|---|---|
| **Build command** | *(none)* |
| **Output directory** | `/` (root) |
| **Production branch** | `main` |
| **Framework preset** | None |

1. Connect `nothinginfinity/afo-site` in Cloudflare Pages
2. Set output directory to `/`
3. Leave build command blank
4. Deploy

The site deploys instantly — no build step required.

---

## AFO File Exposure

This site exposes the following AI-readable files:

| File | Purpose |
|---|---|
| `/llms.txt` | Plain-text identity summary for LLMs |
| `/.well-known/agent-context.json` | Structured business identity |
| `/.well-known/agent-actions.json` | Available actions for AI agents |
| `/.well-known/agent-policy.json` | Compliance rules and claim boundaries |
| `/.well-known/context-cookie.json` | Concise identity memory object |
| `/robots.txt` | Crawler permissions + AI file hints |
| `/sitemap-agent.xml` | Agent-optimized sitemap |
| `/data/audits/*.json` | Benchmark audit data |
| `/data/reports/*.json` | Before/after visibility reports |

---

## Roadmap

| Phase | Description | Status |
|---|---|---|
| **Phase 1** | Static proof site | ✅ In progress |
| **Phase 2** | Live free-audit intake (form → backend) | 🔜 Next |
| **Phase 3** | GitHub Actions audit queue | 🔜 Planned |
| **Phase 4** | Generated customer dashboards | 🔜 Planned |
| **Phase 5** | AFO Index — public directory of AFO-installed sites | 🔜 Planned |

---

## License

All rights reserved. AFO is a proprietary system.
