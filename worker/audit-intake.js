/**
 * AFO Audit Intake Worker
 * Route: POST /api/audit-request
 *
 * Responsibilities:
 *   1. CORS preflight handling
 *   2. Rate limiting (basic IP-based via KV, optional)
 *   3. Input validation (url, name, email, category)
 *   4. Honeypot spam guard
 *   5. Timestamp + request ID generation
 *   6. Forward to GitHub:
 *      - Option A: Create a GitHub Issue in nothinginfinity/afo-site
 *      - Option B: Trigger workflow_dispatch on audit-queue.yml
 *   7. Return success JSON to client
 *
 * Required Cloudflare Worker env vars (set in CF Dashboard > Workers > Settings > Variables):
 *   GITHUB_TOKEN       — Fine-grained PAT with issues:write + actions:write on nothinginfinity/afo-site
 *   GITHUB_REPO        — "nothinginfinity/afo-site"
 *   GITHUB_INTAKE_MODE — "issue" | "dispatch" (default: "issue")
 *   ALLOWED_ORIGIN     — "https://afo-site.jaredtechfit.workers.dev" (or * for dev)
 *
 * Optional:
 *   RATE_LIMIT_KV      — KV namespace binding for IP rate limiting
 *   NOTIFY_EMAIL       — forwarded in issue body for future email step
 */

const GITHUB_API = 'https://api.github.com';

export default {
  async fetch(request, env) {
    const origin = env.ALLOWED_ORIGIN || '*';

    // CORS preflight
    if (request.method === 'OPTIONS') {
      return corsResponse(null, 204, origin);
    }

    if (request.method !== 'POST') {
      return corsResponse({ error: 'Method not allowed' }, 405, origin);
    }

    const url = new URL(request.url);
    if (url.pathname !== '/api/audit-request') {
      return corsResponse({ error: 'Not found' }, 404, origin);
    }

    // --- Parse body ---
    let body;
    try {
      body = await request.json();
    } catch {
      return corsResponse({ error: 'Invalid JSON body' }, 400, origin);
    }

    // --- Honeypot check (field must be absent or empty) ---
    if (body.website_confirm) {
      // Silently accept to not tip off bots
      return corsResponse({ ok: true, request_id: fakeId() }, 200, origin);
    }

    // --- Validate required fields ---
    const errors = validate(body);
    if (errors.length > 0) {
      return corsResponse({ error: 'Validation failed', details: errors }, 422, origin);
    }

    // --- Basic IP rate limit (requires KV binding RATE_LIMIT_KV) ---
    if (env.RATE_LIMIT_KV) {
      const ip = request.headers.get('CF-Connecting-IP') || 'unknown';
      const key = `rl:${ip}`;
      const count = parseInt(await env.RATE_LIMIT_KV.get(key) || '0', 10);
      if (count >= 3) {
        return corsResponse({ error: 'Too many requests. Please try again later.' }, 429, origin);
      }
      await env.RATE_LIMIT_KV.put(key, String(count + 1), { expirationTtl: 3600 });
    }

    // --- Build audit request record ---
    const requestId = generateId();
    const record = {
      request_id: requestId,
      received_at: new Date().toISOString(),
      source: 'free-audit-form',
      site_url: sanitize(body.url),
      business_name: sanitize(body.name),
      contact_email: sanitize(body.email || ''),
      business_category: sanitize(body.category || ''),
      ip_country: request.cf?.country || 'unknown',
      status: 'received',
    };

    // --- Forward to GitHub ---
    const mode = env.GITHUB_INTAKE_MODE || 'issue';
    const repo = env.GITHUB_REPO || 'nothinginfinity/afo-site';
    const token = env.GITHUB_TOKEN;

    if (!token) {
      // No token configured — log and return success anyway (safe degraded mode)
      console.warn('GITHUB_TOKEN not set. Request captured but not forwarded.', record);
      return corsResponse({
        ok: true,
        request_id: requestId,
        message: 'Audit request received. You will be contacted within 24–48 hours.',
        _degraded: true,
      }, 200, origin);
    }

    try {
      if (mode === 'dispatch') {
        await triggerDispatch(token, repo, record);
      } else {
        await createIssue(token, repo, record);
      }
    } catch (err) {
      console.error('GitHub handoff failed:', err.message);
      // Don't surface GitHub errors to the public — still return success
      return corsResponse({
        ok: true,
        request_id: requestId,
        message: 'Audit request received. You will be contacted within 24–48 hours.',
        _note: 'GitHub handoff error — check Worker logs.',
      }, 200, origin);
    }

    return corsResponse({
      ok: true,
      request_id: requestId,
      message: 'Audit request received. You will be contacted within 24–48 hours.',
    }, 200, origin);
  },
};

// ──────────────────────────────────
// GitHub: Create Issue
// ──────────────────────────────────
async function createIssue(token, repo, record) {
  const body = [
    `## AFO Audit Request`,
    ``,
    `| Field | Value |`,
    `|---|---|`,
    `| **Request ID** | \`${record.request_id}\` |`,
    `| **Received** | ${record.received_at} |`,
    `| **Site URL** | ${record.site_url} |`,
    `| **Business Name** | ${record.business_name} |`,
    `| **Contact Email** | ${record.contact_email || '_not provided_'} |`,
    `| **Category** | ${record.business_category || '_not provided_'} |`,
    `| **Country** | ${record.ip_country} |`,
    ``,
    `### Next Steps`,
    `- [ ] Run baseline audit on \`${record.site_url}\``,
    `- [ ] Commit results to \`/data/audits/${record.request_id}.json\``,
    `- [ ] Generate report at \`/data/reports/${record.request_id}-report.json\``,
    `- [ ] Notify client at ${record.contact_email || '_no email_'}`,
    ``,
    `\`\`\`json`,
    JSON.stringify(record, null, 2),
    `\`\`\``,
  ].join('\n');

  const res = await fetch(`${GITHUB_API}/repos/${repo}/issues`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/vnd.github+json',
      'Content-Type': 'application/json',
      'X-GitHub-Api-Version': '2022-11-28',
      'User-Agent': 'afo-intake-worker/1.0',
    },
    body: JSON.stringify({
      title: `[Audit Request] ${record.business_name} — ${record.site_url}`,
      body,
      labels: ['audit-request', 'phase-2'],
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`GitHub issue creation failed: ${res.status} ${text}`);
  }
}

// ──────────────────────────────────
// GitHub: workflow_dispatch
// ──────────────────────────────────
async function triggerDispatch(token, repo, record) {
  const res = await fetch(
    `${GITHUB_API}/repos/${repo}/actions/workflows/audit-queue.yml/dispatches`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/vnd.github+json',
        'Content-Type': 'application/json',
        'X-GitHub-Api-Version': '2022-11-28',
        'User-Agent': 'afo-intake-worker/1.0',
      },
      body: JSON.stringify({
        ref: 'main',
        inputs: {
          request_id: record.request_id,
          site_url: record.site_url,
          business_name: record.business_name,
          contact_email: record.contact_email,
          business_category: record.business_category,
          received_at: record.received_at,
        },
      }),
    }
  );

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`workflow_dispatch failed: ${res.status} ${text}`);
  }
}

// ──────────────────────────────────
// Helpers
// ──────────────────────────────────
function validate(body) {
  const errors = [];
  if (!body.url || typeof body.url !== 'string' || !body.url.startsWith('http')) {
    errors.push('url: must be a valid URL starting with http/https');
  }
  if (!body.name || typeof body.name !== 'string' || body.name.trim().length < 2) {
    errors.push('name: business name is required (min 2 characters)');
  }
  if (body.email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(body.email)) {
    errors.push('email: must be a valid email address');
  }
  return errors;
}

function sanitize(str) {
  if (typeof str !== 'string') return '';
  return str.trim().slice(0, 500);
}

function generateId() {
  const ts = Date.now().toString(36);
  const rand = Math.random().toString(36).slice(2, 7);
  return `afo-${ts}-${rand}`;
}

function fakeId() {
  return `afo-${Date.now().toString(36)}-00000`;
}

function corsResponse(data, status, origin) {
  const headers = {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Content-Type': 'application/json',
  };
  if (status === 204) {
    return new Response(null, { status, headers });
  }
  return new Response(JSON.stringify(data), { status, headers });
}
