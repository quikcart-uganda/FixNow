/**
 * Strict HTML allowlist sanitizer for CMS bodies (QuikCart-inspired, FixNow-owned).
 * Strips scripts, event handlers, dangerous URLs, and disallowed tags/attrs.
 */

const BLOCKED_TAGS = /<\/?(?:script|iframe|object|embed|link|meta|style|form|input|button|textarea|select|base|svg|math|template|noscript)(?:\s[^>]*)?>/gi;
const EVENT_ATTR = /\s+on[a-z]+\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi;
const DANGEROUS_URL = /\s(?:href|src|xlink:href|formaction|action)\s*=\s*(?:"\s*(?:javascript|vbscript|data):[^"]*"|'\s*(?:javascript|vbscript|data):[^']*'|(?:javascript|vbscript|data):[^\s>]+)/gi;
const DATA_ATTR = /\s+data-(?!fixnow-)[a-z0-9_-]+\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi;

export function sanitizeHtml(input: string): string {
  if (!input) return '';
  let html = String(input);
  html = html.replace(BLOCKED_TAGS, '');
  html = html.replace(EVENT_ATTR, '');
  html = html.replace(DANGEROUS_URL, '');
  html = html.replace(DATA_ATTR, '');
  html = html.replace(/<!--[\s\S]*?-->/g, '');
  return html.trim();
}

export function escapeText(input: string): string {
  return String(input || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** Minimal Markdown → HTML, then sanitize. Supports headings, lists, bold/italic, links, paragraphs. */
export function markdownToSafeHtml(markdown: string): string {
  const src = String(markdown || '').replace(/\r\n/g, '\n');
  if (!src.trim()) return '';

  const lines = src.split('\n');
  const out: string[] = [];
  let inUl = false;
  let inOl = false;

  const closeLists = () => {
    if (inUl) {
      out.push('</ul>');
      inUl = false;
    }
    if (inOl) {
      out.push('</ol>');
      inOl = false;
    }
  };

  const inline = (text: string) =>
    escapeText(text)
      .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
      .replace(/\*(.+?)\*/g, '<em>$1</em>')
      .replace(
        /\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g,
        '<a href="$2" rel="noopener noreferrer" target="_blank">$1</a>',
      );

  for (const raw of lines) {
    const line = raw.trimEnd();
    if (!line.trim()) {
      closeLists();
      continue;
    }
    const heading = /^(#{1,3})\s+(.+)$/.exec(line);
    if (heading) {
      closeLists();
      const level = heading[1]!.length;
      out.push(`<h${level}>${inline(heading[2]!)}</h${level}>`);
      continue;
    }
    const ul = /^[-*]\s+(.+)$/.exec(line);
    if (ul) {
      if (inOl) {
        out.push('</ol>');
        inOl = false;
      }
      if (!inUl) {
        out.push('<ul>');
        inUl = true;
      }
      out.push(`<li>${inline(ul[1]!)}</li>`);
      continue;
    }
    const ol = /^\d+\.\s+(.+)$/.exec(line);
    if (ol) {
      if (inUl) {
        out.push('</ul>');
        inUl = false;
      }
      if (!inOl) {
        out.push('<ol>');
        inOl = true;
      }
      out.push(`<li>${inline(ol[1]!)}</li>`);
      continue;
    }
    closeLists();
    out.push(`<p>${inline(line)}</p>`);
  }
  closeLists();
  return sanitizeHtml(out.join('\n'));
}

export function resolveBodyHtml(input: {
  bodyHtml?: string;
  bodyMarkdown?: string;
}): string {
  if (input.bodyMarkdown?.trim()) {
    return markdownToSafeHtml(input.bodyMarkdown);
  }
  return sanitizeHtml(input.bodyHtml || '');
}
