import { useEffect, useState } from 'react'
import { contentApi } from '@fixnow/api'
import { readContentCache, writeContentCache } from './contentCache'

function plainFromPage(page: { excerpt?: string; title?: string; bodyMarkdown?: string; bodyHtml?: string }) {
  if (page.bodyMarkdown?.trim()) {
    return page.bodyMarkdown
      .replace(/^#+\s+/gm, '')
      .replace(/[*_`]/g, '')
      .split('\n')
      .map((l) => l.trim())
      .find(Boolean) || page.excerpt || page.title || ''
  }
  if (page.bodyHtml?.trim()) {
    return page.bodyHtml
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
  }
  return page.excerpt || page.title || ''
}

/** Load short CMS copy (auth welcome messages, etc.) with offline cache. */
export function useCmsCopy(slug: string, audience: 'all' | 'customer' | 'technician' = 'all') {
  const cached = readContentCache(slug, 'en', audience)
  const [text, setText] = useState(cached ? plainFromPage(cached.page) : '')
  const [html, setHtml] = useState(cached?.page.bodyHtml || '')

  useEffect(() => {
    let cancelled = false
    void contentApi
      .getPublic(slug, { audience, language: 'en' })
      .then((res) => {
        if (cancelled) return
        const page = res.data.page
        writeContentCache(slug, page, 'en', audience)
        setText(plainFromPage(page))
        setHtml(page.bodyHtml || '')
      })
      .catch(() => {
        /* keep cache / empty */
      })
    return () => {
      cancelled = true
    }
  }, [slug, audience])

  return { text, html }
}
