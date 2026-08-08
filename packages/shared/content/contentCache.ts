const CACHE_PREFIX = 'fixnow_cms_v1:'

export type CachedContent = {
  page: {
    id: string
    title: string
    slug: string
    bodyHtml: string
    excerpt?: string
    version: number
    updatedAt?: string
    publishedAt?: string | null
    category?: string
    keywords?: string[]
  }
  savedAt: number
}

function key(slug: string, language: string, audience: string) {
  return `${CACHE_PREFIX}${language}:${audience}:${slug}`
}

export function readContentCache(slug: string, language = 'en', audience = 'all'): CachedContent | null {
  try {
    const raw = localStorage.getItem(key(slug, language, audience))
    if (!raw) return null
    return JSON.parse(raw) as CachedContent
  } catch {
    return null
  }
}

export function writeContentCache(
  slug: string,
  page: CachedContent['page'],
  language = 'en',
  audience = 'all',
): void {
  try {
    const payload: CachedContent = { page, savedAt: Date.now() }
    localStorage.setItem(key(slug, language, audience), JSON.stringify(payload))
  } catch {
    /* quota / private mode */
  }
}

export function clearContentCache(slug?: string): void {
  try {
    if (!slug) {
      const keys: string[] = []
      for (let i = 0; i < localStorage.length; i += 1) {
        const k = localStorage.key(i)
        if (k?.startsWith(CACHE_PREFIX)) keys.push(k)
      }
      keys.forEach((k) => localStorage.removeItem(k))
      return
    }
    for (let i = localStorage.length - 1; i >= 0; i -= 1) {
      const k = localStorage.key(i)
      if (k?.startsWith(CACHE_PREFIX) && k.includes(`:${slug}`)) localStorage.removeItem(k)
    }
  } catch {
    /* ignore */
  }
}

/** Display-time HTML sanitizer (defense in depth; API already sanitizes). */
export function sanitizeContentHtml(html: string): string {
  return String(html || '')
    .replace(/<\/?(?:script|iframe|object|embed|link|meta|style|form|input|button|textarea|select|base|svg|math|template|noscript)(?:\s[^>]*)?>/gi, '')
    .replace(/\s+on[a-z]+\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi, '')
    .replace(/\s(?:href|src|xlink:href|formaction|action)\s*=\s*(?:"\s*(?:javascript|vbscript|data):[^"]*"|'\s*(?:javascript|vbscript|data):[^']*'|(?:javascript|vbscript|data):[^\s>]+)/gi, '')
}
