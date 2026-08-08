/**
 * Lightweight markdown → HTML for admin live preview only.
 * Server remains source of truth via content.service resolveBodyHtml.
 */

function escapeText(input: string): string {
  return String(input || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function inline(text: string): string {
  return escapeText(text)
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g, '<a href="$2" rel="noopener noreferrer">$1</a>')
}

export function markdownToPreviewHtml(markdown: string): string {
  const src = String(markdown || '').replace(/\r\n/g, '\n').trim()
  if (!src) return '<p class="text-ink-muted">Start writing to see a live preview…</p>'

  const lines = src.split('\n')
  const out: string[] = []
  let inUl = false
  let inOl = false

  const closeLists = () => {
    if (inUl) {
      out.push('</ul>')
      inUl = false
    }
    if (inOl) {
      out.push('</ol>')
      inOl = false
    }
  }

  for (const raw of lines) {
    const line = raw.trimEnd()
    if (!line.trim()) {
      closeLists()
      continue
    }
    if (/^###\s+/.test(line)) {
      closeLists()
      out.push(`<h3>${inline(line.replace(/^###\s+/, ''))}</h3>`)
      continue
    }
    if (/^##\s+/.test(line)) {
      closeLists()
      out.push(`<h2>${inline(line.replace(/^##\s+/, ''))}</h2>`)
      continue
    }
    if (/^#\s+/.test(line)) {
      closeLists()
      out.push(`<h1>${inline(line.replace(/^#\s+/, ''))}</h1>`)
      continue
    }
    if (/^[-*]\s+/.test(line)) {
      if (!inUl) {
        closeLists()
        out.push('<ul>')
        inUl = true
      }
      out.push(`<li>${inline(line.replace(/^[-*]\s+/, ''))}</li>`)
      continue
    }
    if (/^\d+\.\s+/.test(line)) {
      if (!inOl) {
        closeLists()
        out.push('<ol>')
        inOl = true
      }
      out.push(`<li>${inline(line.replace(/^\d+\.\s+/, ''))}</li>`)
      continue
    }
    closeLists()
    out.push(`<p>${inline(line)}</p>`)
  }
  closeLists()
  return out.join('\n')
}
