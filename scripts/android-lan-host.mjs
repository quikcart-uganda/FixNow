/**
 * Print / optionally write the LAN host for physical Android devices.
 *
 * Usage:
 *   npm run android:lan
 *   node scripts/android-lan-host.mjs --write   # appends to .env.local
 */

import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(__dirname, '..')
const write = process.argv.includes('--write')

function detectLanIpv4() {
  const ifaces = os.networkInterfaces()
  const found = []
  for (const entries of Object.values(ifaces)) {
    for (const entry of entries || []) {
      if (entry.family !== 'IPv4' || entry.internal) continue
      const h = entry.address
      if (
        /^192\.168\./.test(h) ||
        /^10\./.test(h) ||
        /^172\.(1[6-9]|2\d|3[0-1])\./.test(h)
      ) {
        found.push(h)
      }
    }
  }
  return found
}

const hosts = detectLanIpv4()
if (!hosts.length) {
  console.error('No private LAN IPv4 address found. Connect to Wi‑Fi and retry.')
  process.exit(1)
}

const primary = hosts[0]
console.log('Detected LAN address(es):')
for (const h of hosts) console.log(`  ${h}`)
console.log('')
console.log('For a physical Android device, set before build:')
console.log(`  VITE_DEV_LAN_HOST=${primary}`)
console.log('Then:')
console.log('  npm run build && npx cap sync android')
console.log('Ensure the backend listens on 0.0.0.0:4000 and the phone is on the same Wi‑Fi.')

if (write) {
  const envLocal = path.join(ROOT, '.env.local')
  let body = fs.existsSync(envLocal) ? fs.readFileSync(envLocal, 'utf8') : ''
  if (/^VITE_DEV_LAN_HOST=/m.test(body)) {
    body = body.replace(/^VITE_DEV_LAN_HOST=.*$/m, `VITE_DEV_LAN_HOST=${primary}`)
  } else {
    body = `${body.trimEnd()}\n\n# Auto-written for physical Android devices\nVITE_DEV_LAN_HOST=${primary}\n`
  }
  fs.writeFileSync(envLocal, body, 'utf8')
  console.log(`\nUpdated ${envLocal}`)
}
