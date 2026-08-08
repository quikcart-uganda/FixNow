/**
 * Lightweight CMS smoke script.
 * Usage: node scripts/cms-e2e.mjs
 * Requires backend on localhost:4000 with seeded content.
 */
const BASE = process.env.FIXNOW_API_URL || 'http://localhost:4000/api/v1'

async function get(path) {
  const res = await fetch(`${BASE}${path}`, { headers: { Accept: 'application/json' } })
  const json = await res.json().catch(() => null)
  if (!res.ok) throw new Error(`${path} → ${res.status} ${JSON.stringify(json)}`)
  return json
}

const slugs = ['privacy-policy', 'terms', 'help', 'about', 'faq', 'delete-account']

async function main() {
  console.log('CMS public smoke against', BASE)
  for (const slug of slugs) {
    const body = await get(`/public/content/${slug}`)
    const page = body?.data?.page
    if (!page?.bodyHtml || page.status !== 'published') {
      throw new Error(`Invalid page for ${slug}`)
    }
    console.log('OK', slug, `v${page.version}`, page.title)
  }
  const policy = await get('/public/account/deletion-policy')
  if (!policy?.data?.confirmPhrase) throw new Error('deletion policy missing')
  console.log('OK deletion-policy', policy.data.confirmPhrase)
  const search = await get('/public/content/search?q=privacy')
  console.log('OK search hits', search?.data?.items?.length ?? 0)
  console.log('CMS smoke passed')
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
