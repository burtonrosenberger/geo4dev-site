// Allow only safe link schemes from content-derived URLs (blocks javascript:, data:, etc.)
export function safeUrl(u?: string | null): string | undefined {
  if (!u) return undefined
  const s = String(u).trim()
  if (/^https?:\/\//i.test(s) || /^mailto:/i.test(s)) return s
  return undefined
}

// Display hostname for a content-derived URL, or '' if it cannot be parsed.
export function safeHostname(u?: string | null): string {
  if (!u) return ''
  try {
    return new URL(u).hostname.replace(/^www\./, '')
  } catch {
    return ''
  }
}
