/**
 * Read-only API probe. Hits the public/customer-facing endpoints the UI uses
 * and reports how many items each actually returns, so we can pinpoint where
 * content disappears between the database and the screen.
 */
const BASE = process.env.PROBE_BASE || 'http://127.0.0.1:4000/api/v1';

const endpoints = [
  ['GET', '/categories'],
  ['GET', '/technicians/search'],
  ['GET', '/technicians/search?limit=50'],
  ['GET', '/offers/public'],
  ['GET', '/offers/public/home'],
  ['GET', '/content/public'],
  ['GET', '/content/customer'],
  ['GET', '/content/technician'],
  ['GET', '/content/customer?page=customer.register'],
  ['GET', '/public/content'],
  ['GET', '/subscriptions/plans'],
  ['GET', '/achievements'],
];

function summarize(body) {
  const d = body?.data ?? body;
  if (d == null) return 'null';
  if (Array.isArray(d)) return `array(${d.length})`;
  const parts = [];
  for (const [k, v] of Object.entries(d)) {
    if (Array.isArray(v)) parts.push(`${k}=array(${v.length})`);
    else if (v && typeof v === 'object') {
      const inner = Object.entries(v)
        .map(([ik, iv]) => (Array.isArray(iv) ? `${ik}:${iv.length}` : null))
        .filter(Boolean);
      parts.push(inner.length ? `${k}{${inner.join(',')}}` : `${k}=obj`);
    } else parts.push(`${k}=${JSON.stringify(v)?.slice(0, 40)}`);
  }
  return parts.join(' ') || 'empty-object';
}

for (const [method, path] of endpoints) {
  try {
    const res = await fetch(`${BASE}${path}`, { method, headers: { accept: 'application/json' } });
    const text = await res.text();
    let body;
    try {
      body = JSON.parse(text);
    } catch {
      body = text.slice(0, 120);
    }
    console.log(`${String(res.status).padEnd(4)} ${path}`);
    console.log(`      -> ${summarize(body)}`);
  } catch (err) {
    console.log(`ERR  ${path} -> ${err.message}`);
  }
}
