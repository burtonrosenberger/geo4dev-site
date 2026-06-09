import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { onRequestPost } from './signup'

interface SignupEnv {
  GITHUB_TOKEN?: string
  INTAKE_REPO?: string
  TURNSTILE_SECRET?: string
  RATE_LIMIT?: KVNamespace
}

// In-memory KV double. RATE_LIMIT is a true system boundary (Workers KV), so a
// simple Map-backed get/put is the one acceptable test double here.
function makeKv(overrides: Partial<KVNamespace> = {}): KVNamespace {
  const store = new Map<string, string>()
  const kv = {
    async get(key: string): Promise<string | null> {
      return store.has(key) ? store.get(key)! : null
    },
    async put(key: string, value: string): Promise<void> {
      store.set(key, value)
    },
  }
  return { ...kv, ...overrides } as unknown as KVNamespace
}

function makeRequest(body: unknown, headers: Record<string, string> = {}): Request {
  return new Request('https://geo4dev.example/api/signup', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  })
}

// onRequestPost only ever reads { request, env } off its argument, so an object
// carrying those two is a faithful invocation for the behaviors under test.
function invoke(request: Request, env: SignupEnv) {
  const ctx = { request, env } as unknown as Parameters<typeof onRequestPost>[0]
  return onRequestPost(ctx)
}

function githubCalls(fetchMock: ReturnType<typeof vi.fn>): Array<{ url: string; init: RequestInit }> {
  return fetchMock.mock.calls
    .map(([url, init]) => ({ url: String(url), init: (init ?? {}) as RequestInit }))
    .filter((c) => c.url.startsWith('https://api.github.com/'))
}

function postedIssue(fetchMock: ReturnType<typeof vi.fn>): { title: string; body: string; labels: string[] } {
  const calls = githubCalls(fetchMock)
  expect(calls.length).toBe(1)
  return JSON.parse(String(calls[0].init.body))
}

const okGithub = () =>
  vi.fn(async () => new Response(JSON.stringify({}), { status: 201 }))

const FULL_ENV = (): SignupEnv => ({
  GITHUB_TOKEN: 'token-xyz',
  INTAKE_REPO: 'org/intake',
  RATE_LIMIT: makeKv(),
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('onRequestPost honeypot', () => {
  it('accepts and drops a submission with a filled company field without calling GitHub', async () => {
    const fetchMock = okGithub()
    vi.stubGlobal('fetch', fetchMock)

    const res = await invoke(
      makeRequest({ company: 'AcmeBot', email: 'a@b.com', name: 'X' }),
      FULL_ENV(),
    )

    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ ok: true })
    expect(githubCalls(fetchMock).length).toBe(0)
  })
})

describe('onRequestPost fail-closed configuration', () => {
  it('returns 503 and makes no GitHub call when neither TURNSTILE_SECRET nor RATE_LIMIT is set', async () => {
    const fetchMock = okGithub()
    vi.stubGlobal('fetch', fetchMock)

    const res = await invoke(makeRequest({ email: 'a@b.com' }), {
      GITHUB_TOKEN: 'token',
      INTAKE_REPO: 'org/intake',
    })

    expect(res.status).toBe(503)
    expect(await res.json()).toEqual({ error: 'intake not configured' })
    expect(githubCalls(fetchMock).length).toBe(0)
  })
})

describe('onRequestPost email validation', () => {
  it('returns 400 for a missing email', async () => {
    const fetchMock = okGithub()
    vi.stubGlobal('fetch', fetchMock)

    const res = await invoke(makeRequest({ name: 'X' }), { RATE_LIMIT: makeKv() })

    expect(res.status).toBe(400)
    expect(await res.json()).toEqual({ error: 'valid email required' })
    expect(githubCalls(fetchMock).length).toBe(0)
  })

  it('returns 400 for an invalid email', async () => {
    const fetchMock = okGithub()
    vi.stubGlobal('fetch', fetchMock)

    const res = await invoke(makeRequest({ email: 'not-an-email' }), { RATE_LIMIT: makeKv() })

    expect(res.status).toBe(400)
    expect(await res.json()).toEqual({ error: 'valid email required' })
  })
})

describe('onRequestPost rate limiting', () => {
  it('allows the first 5 POSTs from one IP and returns 429 on the 6th', async () => {
    const fetchMock = okGithub()
    vi.stubGlobal('fetch', fetchMock)

    const kv = makeKv()
    const env: SignupEnv = { GITHUB_TOKEN: 'token', INTAKE_REPO: 'org/intake', RATE_LIMIT: kv }
    const headers = { 'cf-connecting-ip': '203.0.113.7' }

    const statuses: number[] = []
    for (let i = 0; i < 6; i++) {
      const res = await invoke(makeRequest({ email: `user${i}@example.com` }, headers), env)
      statuses.push(res.status)
    }

    expect(statuses).toEqual([200, 200, 200, 200, 200, 429])
    expect(githubCalls(fetchMock).length).toBe(5)
  })

  it('isolates counters per cf-connecting-ip', async () => {
    const fetchMock = okGithub()
    vi.stubGlobal('fetch', fetchMock)

    const kv = makeKv()
    const env: SignupEnv = { GITHUB_TOKEN: 'token', INTAKE_REPO: 'org/intake', RATE_LIMIT: kv }

    const resA = await invoke(
      makeRequest({ email: 'a@example.com' }, { 'cf-connecting-ip': '198.51.100.1' }),
      env,
    )
    const resB = await invoke(
      makeRequest({ email: 'b@example.com' }, { 'cf-connecting-ip': '198.51.100.2' }),
      env,
    )

    expect(resA.status).toBe(200)
    expect(resB.status).toBe(200)
  })

  it('fails closed with 429 when the KV get throws', async () => {
    const fetchMock = okGithub()
    vi.stubGlobal('fetch', fetchMock)

    const kv = makeKv({
      get: vi.fn(async () => {
        throw new Error('kv unavailable')
      }),
    })
    const env: SignupEnv = { GITHUB_TOKEN: 'token', INTAKE_REPO: 'org/intake', RATE_LIMIT: kv }

    const res = await invoke(makeRequest({ email: 'a@example.com' }), env)

    expect(res.status).toBe(429)
    expect(await res.json()).toEqual({ error: 'too many requests' })
    expect(githubCalls(fetchMock).length).toBe(0)
  })
})

describe('onRequestPost link scheme and host handling', () => {
  it.each([
    ['javascript:alert(1)'],
    ['http://169.254.169.254/'],
    ['http://localhost/'],
    ['http://127.0.0.1/'],
  ])('accepts the submission but omits the Link line for unsafe link %s', async (link) => {
    const fetchMock = okGithub()
    vi.stubGlobal('fetch', fetchMock)

    const res = await invoke(makeRequest({ email: 'a@example.com', link }), FULL_ENV())

    expect(res.status).toBe(200)
    const issue = postedIssue(fetchMock)
    expect(issue.body.includes('**Link:**')).toBe(false)
  })

  it('includes a Link line for a normal external https link', async () => {
    const fetchMock = okGithub()
    vi.stubGlobal('fetch', fetchMock)

    const res = await invoke(
      makeRequest({ email: 'a@example.com', link: 'https://example.com/x' }),
      FULL_ENV(),
    )

    expect(res.status).toBe(200)
    const issue = postedIssue(fetchMock)
    expect(issue.body).toContain('**Link:** <https://example.com/x>')
  })
})

describe('onRequestPost internal-host link rejection (IPv6 and DNS forms)', () => {
  it.each([
    ['http://[::1]/'], // IPv6 loopback
    ['http://[::ffff:127.0.0.1]/'], // IPv4-mapped loopback
    ['http://[::ffff:169.254.169.254]/'], // IPv4-mapped cloud metadata
    ['http://[fc00::1]/'], // IPv6 unique-local
    ['http://[fe80::1]/'], // IPv6 link-local
    ['http://metadata.google.internal/'], // cloud metadata DNS
    ['http://foo.internal/'], // internal DNS suffix
    ['http://100.64.0.1/'], // CGNAT
    ['http://metadata.google.internal./'], // trailing-dot FQDN cloud metadata (NO_PROXY-style bypass)
    ['http://localhost./'], // trailing-dot FQDN loopback
    ['http://foo.internal./'], // trailing-dot FQDN internal DNS suffix
    ['http://metadata.google.internal../'], // double-dot FQDN cloud metadata (WHATWG preserves multiple trailing dots)
    ['http://metadata.google.internal.../'], // triple-dot FQDN cloud metadata
    ['http://metadata.google.internal.%2e/'], // percent-encoded dot decodes to a second trailing dot
    ['http://169.254.169.254../'], // multi-dot cloud metadata IPv4
    ['http://localhost../'], // multi-dot FQDN loopback
    ['http://foo.internal../'], // multi-dot FQDN internal DNS suffix
    ['http://./'], // bare-dot host normalizes to empty and is rejected
  ])('accepts the submission but omits the Link line for internal link %s', async (link) => {
    const fetchMock = okGithub()
    vi.stubGlobal('fetch', fetchMock)

    const res = await invoke(makeRequest({ email: 'a@example.com', link }), FULL_ENV())

    expect(res.status).toBe(200)
    const issue = postedIssue(fetchMock)
    expect(issue.body.includes('**Link:**')).toBe(false)
  })

  it('still renders a Link line for an external https control link', async () => {
    const fetchMock = okGithub()
    vi.stubGlobal('fetch', fetchMock)

    const res = await invoke(
      makeRequest({ email: 'a@example.com', link: 'https://example.com/x' }),
      FULL_ENV(),
    )

    expect(res.status).toBe(200)
    const issue = postedIssue(fetchMock)
    expect(issue.body).toContain('**Link:** <https://example.com/x>')
  })
})

describe('onRequestPost link credential stripping', () => {
  it('strips embedded user:pass credentials from the rendered link', async () => {
    const fetchMock = okGithub()
    vi.stubGlobal('fetch', fetchMock)

    const res = await invoke(
      makeRequest({ email: 'a@example.com', link: 'https://user:secrettoken@example.com/path' }),
      FULL_ENV(),
    )

    expect(res.status).toBe(200)
    const issue = postedIssue(fetchMock)

    const linkLine = issue.body.split('\n').find((l) => l.startsWith('**Link:**'))
    expect(linkLine).toBeDefined()
    expect(linkLine).toContain('example.com/path')
    expect(linkLine!.includes('secrettoken')).toBe(false)
    expect(linkLine!.includes('user:')).toBe(false)
  })
})

describe('onRequestPost message-field markdown/autolink neutralization', () => {
  it('escapes bare URLs, www autolinks, setext headings, thematic breaks, and list markers', async () => {
    const fetchMock = okGithub()
    vi.stubGlobal('fetch', fetchMock)

    const message = [
      'http://evil.example/phish',
      'www.evil.example',
      'Heading text',
      '======',
      '---',
      '- item',
    ].join('\n')

    const res = await invoke(makeRequest({ email: 'a@example.com', message }), FULL_ENV())

    expect(res.status).toBe(200)
    const issue = postedIssue(fetchMock)

    // The ':' in the scheme is entity-escaped, so the bare URL cannot autolink.
    expect(issue.body).toContain('http&#58;')
    expect(issue.body.includes('http://evil.example')).toBe(false)

    // The '.' in the host is escaped, so the www form cannot autolink.
    expect(issue.body.includes('www.evil.example')).toBe(false)

    // No setext underline or thematic break survives: '=' -> &#61;, '-' -> &#45;.
    expect(issue.body.includes('\n=')).toBe(false)
    expect(issue.body.includes('\n---')).toBe(false)

    // The visible words still survive in escaped form.
    expect(issue.body).toContain('phish')
    expect(issue.body).toContain('item')
  })

  it('escapes ATX heading, emphasis, code span, and mention characters to numeric entities', async () => {
    const fetchMock = okGithub()
    vi.stubGlobal('fetch', fetchMock)

    const res = await invoke(
      makeRequest({
        email: 'a@example.com',
        message: '# heading **bold** `code` @mention',
      }),
      FULL_ENV(),
    )

    expect(res.status).toBe(200)
    const issue = postedIssue(fetchMock)

    expect(issue.body).toContain('&#35;') // #
    expect(issue.body).toContain('&#42;') // *
    expect(issue.body).toContain('&#96;') // `
    expect(issue.body).toContain('&#64;') // @
    expect(issue.body.includes('# heading')).toBe(false)
    expect(issue.body.includes('`code`')).toBe(false)
  })
})

describe('onRequestPost markdown-injection sanitization', () => {
  it('neutralizes markdown/HTML control characters in name and message', async () => {
    const fetchMock = okGithub()
    vi.stubGlobal('fetch', fetchMock)

    const res = await invoke(
      makeRequest({
        email: 'a@example.com',
        name: '@mention # heading `code` <script> **bold**',
        message: 'hello @mention <script>alert(1)</script> **Email:** forged',
      }),
      FULL_ENV(),
    )

    expect(res.status).toBe(200)
    const issue = postedIssue(fetchMock)

    // @ becomes &#64; so it can never be an active GitHub mention.
    expect(issue.body.includes('@mention')).toBe(false)
    expect(issue.body).toContain('&#64;mention')

    // < and > are entity-encoded so no raw HTML survives.
    expect(issue.body.includes('<script>')).toBe(false)
    expect(issue.body).toContain('&lt;script&gt;')

    // User text cannot forge a second provenance field; exactly one real
    // **Email:** line exists.
    const emailFieldMatches = issue.body.match(/\*\*Email:\*\*/g) ?? []
    expect(emailFieldMatches.length).toBe(1)
  })

  it('strips CR/LF from the issue title', async () => {
    const fetchMock = okGithub()
    vi.stubGlobal('fetch', fetchMock)

    const res = await invoke(
      makeRequest({ email: 'a@example.com', name: 'Line1\r\nLine2\nLine3' }),
      FULL_ENV(),
    )

    expect(res.status).toBe(200)
    const issue = postedIssue(fetchMock)
    expect(issue.title.includes('\n')).toBe(false)
    expect(issue.title.includes('\r')).toBe(false)
  })
})

describe('onRequestPost type coercion', () => {
  it('coerces non-string field values via clamp without throwing', async () => {
    const fetchMock = okGithub()
    vi.stubGlobal('fetch', fetchMock)

    const res = await invoke(
      makeRequest({ email: 'a@example.com', name: 12345, message: { nested: true } }),
      FULL_ENV(),
    )

    expect(res.status).toBe(200)
    const issue = postedIssue(fetchMock)
    expect(issue.title).toContain('12345')
  })
})

describe('onRequestPost GitHub failure', () => {
  it('returns 502 when GitHub responds non-ok', async () => {
    const fetchMock = vi.fn(async () => new Response('boom', { status: 500 }))
    vi.stubGlobal('fetch', fetchMock)

    const res = await invoke(makeRequest({ email: 'a@example.com' }), FULL_ENV())

    expect(res.status).toBe(502)
    expect(await res.json()).toEqual({ error: 'intake failed' })
  })
})

describe('onRequestPost turnstile', () => {
  beforeEach(() => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string | URL) => {
        if (String(url).includes('turnstile')) {
          return new Response(JSON.stringify({ success: true }), { status: 200 })
        }
        return new Response(JSON.stringify({}), { status: 201 })
      }),
    )
  })

  it('returns 403 when a turnstile token is required but missing', async () => {
    const res = await invoke(makeRequest({ email: 'a@example.com' }), {
      TURNSTILE_SECRET: 'secret',
      GITHUB_TOKEN: 'token',
      INTAKE_REPO: 'org/intake',
    })

    expect(res.status).toBe(403)
    expect(await res.json()).toEqual({ error: 'verification required' })
  })

  it('accepts when siteverify reports success', async () => {
    const res = await invoke(
      makeRequest({ email: 'a@example.com', turnstileToken: 'tok' }),
      { TURNSTILE_SECRET: 'secret', GITHUB_TOKEN: 'token', INTAKE_REPO: 'org/intake' },
    )

    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ ok: true })
  })

  it('returns 403 when siteverify reports failure', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string | URL) => {
        if (String(url).includes('turnstile')) {
          return new Response(JSON.stringify({ success: false }), { status: 200 })
        }
        return new Response(JSON.stringify({}), { status: 201 })
      }),
    )

    const res = await invoke(
      makeRequest({ email: 'a@example.com', turnstileToken: 'tok' }),
      { TURNSTILE_SECRET: 'secret', GITHUB_TOKEN: 'token', INTAKE_REPO: 'org/intake' },
    )

    expect(res.status).toBe(403)
    expect(await res.json()).toEqual({ error: 'verification failed' })
  })
})
