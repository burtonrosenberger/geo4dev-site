// Cloudflare Pages Function: POST /api/signup
// Opens a GitHub issue in the PRIVATE intake repo. No datastore, no email.
// Hardened: size/byte caps, honeypot, http(s)-only + non-internal link,
// markdown-injection-safe rendering, IP rate limiting, fail-closed bot protection.
//
// Runtime config (Pages dashboard secrets + wrangler.toml [vars]/bindings):
//   Variable: INTAKE_REPO       = "g4d-nlt-cega-3ie/geo4dev-intake"
//   Secret:   GITHUB_TOKEN      = fine-grained, Issues: write on INTAKE_REPO
//   Secret:   TURNSTILE_SECRET  = Cloudflare Turnstile secret (if set, enforced)
//   KV:       RATE_LIMIT        = Workers KV namespace for per-IP throttling
// At least one of TURNSTILE_SECRET or RATE_LIMIT must be present, or the
// endpoint refuses every request (fail-closed; no silently-open intake).

interface Env {
  GITHUB_TOKEN?: string
  INTAKE_REPO?: string
  TURNSTILE_SECRET?: string
  RATE_LIMIT?: KVNamespace
}

interface TurnstileVerifyResponse {
  success: boolean
  'error-codes'?: string[]
  challenge_ts?: string
  hostname?: string
  action?: string
  cdata?: string
}

const TYPES = ['contact', 'submission'] as const
type SubType = (typeof TYPES)[number]

const MAX_BODY = 16_000 // bytes
const RATE_LIMIT_MAX = 5 // requests per window per IP
const RATE_LIMIT_WINDOW = 600 // seconds

const clamp = (v: unknown, n: number) => String(v ?? '').trim().slice(0, n)

// GitHub renders issue bodies as GitHub-Flavored Markdown. Map every
// Markdown/HTML/autolink-significant character to a numeric character
// reference: it renders as the original glyph but the inline parser never
// treats it as syntax, so user input cannot create @mentions, #refs, code
// spans, links/images, emphasis, HTML, tables, ATX or setext headings,
// thematic breaks, list markers, or GFM bare-URL/www/email autolinks, nor
// forge the **Email:** / <sub> provenance lines. Covering ':' and '.' breaks
// `scheme://`, `mailto:` and `www.` autolinks; '=' and '-' break setext
// headings and `---` thematic breaks.
const MD_ENTITIES: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  '`': '&#96;',
  '*': '&#42;',
  '_': '&#95;',
  '[': '&#91;',
  ']': '&#93;',
  '(': '&#40;',
  ')': '&#41;',
  '#': '&#35;',
  '!': '&#33;',
  '~': '&#126;',
  '|': '&#124;',
  '@': '&#64;',
  '\\': '&#92;',
  ':': '&#58;',
  '=': '&#61;',
  '+': '&#43;',
  '.': '&#46;',
  '-': '&#45;',
}
const escapeMd = (s: string) => s.replace(/[&<>"`*_[\]()#!~|@\\:=+.-]/g, (c) => MD_ENTITIES[c])

// Single-line, control-free, escaped value for inline body fields.
const inlineField = (s: string) =>
  escapeMd(s.replace(/[\x00-\x1F\x7F]+/g, ' ').replace(/\s+/g, ' ').trim())

// Multi-line body value: keep newlines/tabs, drop other control chars, escape.
const multilineField = (s: string) =>
  escapeMd(s.replace(/\r\n?/g, '\n').replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]+/g, ' ')).trim()

// Plain-text issue title (GitHub does not render Markdown in titles): collapse
// all control chars/whitespace to single spaces.
const titleText = (s: string) => s.replace(/[\x00-\x1F\x7F\s]+/g, ' ').trim()

// Reject loopback / private / link-local / metadata hosts (IPv4, IPv6 incl.
// IPv4-mapped, and internal DNS names) so a reviewer is never handed an
// internal-looking clickable link.
function isInternalIPv4(host: string): boolean {
  const m = host.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/)
  if (!m) return false
  const a = Number(m[1])
  const b = Number(m[2])
  if (a > 255 || b > 255 || Number(m[3]) > 255 || Number(m[4]) > 255) return true
  if (a === 0 || a === 10 || a === 127) return true
  if (a === 169 && b === 254) return true // link-local incl. 169.254.169.254
  if (a === 172 && b >= 16 && b <= 31) return true
  if (a === 192 && b === 168) return true
  if (a === 100 && b >= 64 && b <= 127) return true // CGNAT 100.64.0.0/10
  return false
}

function isInternalHost(host: string): boolean {
  let h = host.toLowerCase()
  // Strip ALL trailing dots: a fully-qualified `metadata.google.internal.` is
  // the same host as `metadata.google.internal`, but WHATWG URL preserves
  // trailing dots verbatim (and even synthesizes extra ones from `%2e`), so
  // without this the equality/suffix checks below are bypassed by any
  // trailing-dot form -- `metadata.google.internal.`, `...internal..`, etc.
  // (same class as the axios NO_PROXY trailing-dot SSRF bypass). One `.slice`
  // is not enough: multiple trailing dots survive it, so normalize them all.
  h = h.replace(/\.+$/, '')
  // A bare-dot / empty host is not a resolvable public host; treat as unsafe.
  if (h === '') return true

  // IPv6 literal: URL.hostname keeps the surrounding brackets.
  if (h.startsWith('[') && h.endsWith(']')) {
    const v6 = h.slice(1, -1)
    if (v6 === '::' || v6 === '::1') return true
    if (/^f[cd][0-9a-f]/.test(v6)) return true // fc00::/7 unique-local
    if (/^fe[89ab]/.test(v6)) return true // fe80::/10 link-local
    const mapped = v6.match(/^::ffff:(.+)$/) // IPv4-mapped IPv6
    if (mapped) {
      const tail = mapped[1]
      if (isInternalIPv4(tail)) return true
      const hx = tail.match(/^([0-9a-f]{1,4}):([0-9a-f]{1,4})$/)
      if (hx) {
        const hi = parseInt(hx[1], 16)
        const lo = parseInt(hx[2], 16)
        const v4 = `${(hi >> 8) & 255}.${hi & 255}.${(lo >> 8) & 255}.${lo & 255}`
        if (isInternalIPv4(v4)) return true
      }
    }
    return false
  }

  if (h === 'localhost' || h.endsWith('.localhost')) return true
  // Cloud metadata / internal DNS names.
  if (h === 'metadata' || h === 'instance-data' || h === 'metadata.google.internal') return true
  if (h.endsWith('.internal')) return true
  return isInternalIPv4(h)
}

// Validate a user link to a safe, non-internal http(s) URL. Returns a
// normalized href (credentials stripped, percent-encoded by the URL parser) or
// '' if unacceptable.
function safeLinkHref(raw: string): string {
  if (!raw) return ''
  let url: URL
  try {
    url = new URL(raw)
  } catch {
    return ''
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return ''
  if (!url.hostname || isInternalHost(url.hostname)) return ''
  url.username = '' // drop embedded user:pass@ credentials from the rendered link
  url.password = ''
  return url.href
}

export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  // Advisory size guard on the (spoofable) header; the post-read byte check below
  // is authoritative.
  const len = Number(request.headers.get('content-length') || 0)
  if (len && len > MAX_BODY) return Response.json({ error: 'payload too large' }, { status: 413 })

  let data: unknown
  try {
    const raw = await request.text()
    if (new TextEncoder().encode(raw).length > MAX_BODY) {
      return Response.json({ error: 'payload too large' }, { status: 413 })
    }
    data = JSON.parse(raw)
  } catch {
    return Response.json({ error: 'bad request' }, { status: 400 })
  }
  if (typeof data !== 'object' || data === null) {
    return Response.json({ error: 'bad request' }, { status: 400 })
  }
  const fields = data as Record<string, unknown>

  // honeypot: real users never fill this; silently accept + drop
  if (clamp(fields.company, 200)) return Response.json({ ok: true })

  const hasTurnstile = !!env.TURNSTILE_SECRET
  const rateLimitKv = env.RATE_LIMIT

  // Fail-closed: with neither bot verification nor rate limiting configured the
  // intake would be wide open, so refuse rather than accept.
  if (!hasTurnstile && !rateLimitKv) {
    return Response.json({ error: 'intake not configured' }, { status: 503 })
  }

  // Per-IP rate limit (fail-closed on binding error).
  if (rateLimitKv) {
    const ip = request.headers.get('cf-connecting-ip') || 'unknown'
    const key = `signup:${ip}`
    try {
      const current = await rateLimitKv.get(key)
      const count = current ? Number(current) : 0
      if (count >= RATE_LIMIT_MAX) {
        return Response.json({ error: 'too many requests' }, { status: 429 })
      }
      await rateLimitKv.put(key, String(count + 1), { expirationTtl: RATE_LIMIT_WINDOW })
    } catch {
      return Response.json({ error: 'too many requests' }, { status: 429 })
    }
  }

  const email = clamp(fields.email, 320)
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    return Response.json({ error: 'valid email required' }, { status: 400 })
  }

  if (hasTurnstile) {
    const token = clamp(fields.turnstileToken, 4000)
    if (!token) return Response.json({ error: 'verification required' }, { status: 403 })
    try {
      const v = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          secret: env.TURNSTILE_SECRET,
          response: token,
          remoteip: request.headers.get('cf-connecting-ip') || undefined,
        }),
      })
      const vr = (await v.json()) as TurnstileVerifyResponse
      if (!vr.success) return Response.json({ error: 'verification failed' }, { status: 403 })
    } catch {
      return Response.json({ error: 'verification failed' }, { status: 403 })
    }
  }

  const type: SubType = clamp(fields.type, 20) === 'submission' ? 'submission' : 'contact'
  const name = clamp(fields.name, 200)
  const organization = clamp(fields.organization, 200)
  const interest = clamp(fields.interest, 80)
  const message = clamp(fields.message, 5000)
  const linkHref = safeLinkHref(clamp(fields.link, 500))
  const created = new Date().toISOString()

  if (!env.GITHUB_TOKEN || !env.INTAKE_REPO) {
    return Response.json({ error: 'not configured' }, { status: 500 })
  }

  const heading = type === 'submission' ? 'New submission' : 'New contact message'
  const title = `[${type}] ${heading} — ${titleText(name || email).slice(0, 80)}`
  const body = [
    `**Type:** ${type}`,
    `**Email:** ${inlineField(email)}`,
    name ? `**Name:** ${inlineField(name)}` : null,
    organization ? `**Organization:** ${inlineField(organization)}` : null,
    interest ? `**Interest:** ${inlineField(interest)}` : null,
    linkHref ? `**Link:** <${linkHref}>` : null,
    message ? `\n${multilineField(message)}` : null,
    `\n<sub>Submitted ${created} via the Geo4Dev site. Contains personal data — keep in this private repo.</sub>`,
  ]
    .filter(Boolean)
    .join('\n')

  try {
    const res = await fetch(`https://api.github.com/repos/${env.INTAKE_REPO}/issues`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${env.GITHUB_TOKEN}`,
        Accept: 'application/vnd.github+json',
        'User-Agent': 'geo4dev-site',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ title, body, labels: [type, 'status:new'] }),
    })
    if (!res.ok) return Response.json({ error: 'intake failed' }, { status: 502 })
  } catch {
    return Response.json({ error: 'intake failed' }, { status: 502 })
  }

  return Response.json({ ok: true })
}
