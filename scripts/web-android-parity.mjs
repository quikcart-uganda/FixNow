/**
 * Web ↔ Android parity gate (extended).
 *
 * Ensures the Capacitor Android shell consumes the current Vite SPA
 * (single source of truth) and that critical routes/config stay aligned.
 *
 * Usage:
 *   npm run parity:android
 *   npm run parity:android -- --require-sync
 *   node scripts/check-web-android-parity.mjs
 *
 * Exit 0 = pass. Exit 1 = fail with actionable messages.
 */

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(__dirname, '..')
const requireSync = process.argv.includes('--require-sync')

const errors = []
const warnings = []
const matrix = []

function exists(rel) {
  return fs.existsSync(path.join(ROOT, rel))
}

function read(rel) {
  return fs.readFileSync(path.join(ROOT, rel), 'utf8')
}

function assert(cond, msg) {
  if (!cond) errors.push(msg)
}

function warn(cond, msg) {
  if (!cond) warnings.push(msg)
}

function note(feature, backend, web, android, status) {
  matrix.push({ feature, backend, web, android, status })
}

function fileIncludes(rel, needles) {
  if (!exists(rel)) return false
  const text = read(rel)
  return needles.every((n) => text.includes(n))
}

// --- Single SPA / Capacitor wiring ---
assert(exists('capacitor.config.ts'), 'Missing capacitor.config.ts')
assert(exists('vite.config.ts'), 'Missing vite.config.ts')
assert(exists('src/main.tsx'), 'Missing shared SPA entry src/main.tsx')
assert(exists('src/App.tsx'), 'Missing shared SPA router src/App.tsx')
assert(exists('android'), 'Missing android/ Capacitor project')

const capConfig = read('capacitor.config.ts')
assert(capConfig.includes("webDir: 'dist'") || capConfig.includes('webDir: "dist"'), "capacitor webDir must be 'dist'")
assert(
  capConfig.includes("hostname: 'app.fixnow.local'") || capConfig.includes('hostname: "app.fixnow.local"'),
  'Capacitor hostname should be app.fixnow.local',
)

const viteConfig = read('vite.config.ts')
assert(/base:\s*['"]\.\/['"]/.test(viteConfig), "vite.config.ts must set base: './' for Capacitor asset paths")

// --- No duplicate Android UI ---
const androidJava = path.join(ROOT, 'android', 'app', 'src', 'main', 'java')
if (fs.existsSync(androidJava)) {
  const walk = (dir, acc = []) => {
    for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, ent.name)
      if (ent.isDirectory()) walk(full, acc)
      else acc.push(full)
    }
    return acc
  }
  const javaFiles = walk(androidJava)
  const nonBridge = javaFiles.filter((f) => !/MainActivity\.java$/i.test(f))
  assert(
    nonBridge.length === 0,
    `Unexpected Android Java UI/business files (should only be MainActivity): ${nonBridge
      .map((f) => path.relative(ROOT, f))
      .join(', ')}`,
  )
}

// --- Build scripts must rebuild before sync/copy/run ---
const pkg = JSON.parse(read('package.json'))
const scripts = pkg.scripts || {}
for (const key of ['cap:sync', 'cap:copy', 'cap:run:android', 'mobile:android', 'mobile:sync']) {
  const cmd = String(scripts[key] || '')
  assert(
    cmd.includes('npm run build') || cmd.includes('vite build'),
    `Script "${key}" must rebuild before Capacitor sync/run (got: ${cmd || 'missing'})`,
  )
}
assert(scripts['parity:android'], 'package.json missing parity:android script')

// --- CORS allows Capacitor origin in non-prod ---
const cors = read('backend/src/config/cors.ts')
assert(/app\.fixnow\.local/.test(cors), 'backend CORS must allow https://app.fixnow.local for Capacitor WebView')

// --- Debug cleartext overlay for local API ---
assert(
  exists('android/app/src/debug/res/xml/network_security_config.xml'),
  'Missing android/app/src/debug/res/xml/network_security_config.xml (debug cleartext for emulator/LAN)',
)
assert(exists('android/app/src/main/res/xml/network_security_config.xml'), 'Missing release network_security_config.xml')
const releaseNsc = read('android/app/src/main/res/xml/network_security_config.xml')
assert(
  /cleartextTrafficPermitted="false"/.test(releaseNsc),
  'Release network_security_config must keep cleartextTrafficPermitted=false',
)

// --- Admin intentionally gated on native ---
const appTsx = read('src/App.tsx')
assert(/function AdminPortalGate/.test(appTsx), 'AdminPortalGate missing in src/App.tsx')
assert(
  /isNativePlatform\(\)/.test(appTsx) && /Navigate to="\/"/.test(appTsx),
  'AdminPortalGate must redirect native users away from /admin/*',
)
note('Admin portal', 'Yes', 'Yes', 'Gated off (intentional)', 'Complete (by design)')

// --- Technician subscription / upgrade routes (same router for web + Capacitor) ---
const techRoutes = exists('apps/technician/routes.tsx') ? read('apps/technician/routes.tsx') : ''
const techNeedles = [
  ['upgrade', 'path="upgrade"'],
  ['plans', 'path="plans"'],
  ['plan detail', 'path="plans/:code"'],
  ['subscription centre', 'path="subscription"'],
  ['boosts', 'path="boosts"'],
  ['settings billing', 'path="settings/billing"'],
]
for (const [label, needle] of techNeedles) {
  assert(techRoutes.includes(needle), `Technician routes missing ${label} (${needle})`)
  note(`Technician ${label}`, 'Yes', 'Yes', 'Yes (shared SPA)', 'Complete')
}

// --- Customer core routes ---
const custRoutes = exists('apps/customer/routes.tsx') ? read('apps/customer/routes.tsx') : ''
const custNeedles = [
  ['home', 'path="home"'],
  ['search', 'path="search"'],
  ['post-job', 'path="post-job"'],
  ['jobs', 'path="jobs"'],
  ['messages', 'path="messages"'],
  ['payments', 'path="payments"'],
  ['offers', 'path="offers"'],
]
for (const [label, needle] of custNeedles) {
  assert(custRoutes.includes(needle), `Customer routes missing ${label} (${needle})`)
  note(`Customer ${label}`, 'Yes', 'Yes', 'Yes (shared SPA)', 'Complete')
}

// --- Shared packages (single business logic) ---
assert(exists('packages/api/client.ts') || exists('packages/api/index.ts'), 'Missing packages/api')
assert(exists('packages/native/platform.ts'), 'Missing packages/native/platform.ts')
assert(exists('packages/native/bootstrap.ts'), 'Missing packages/native/bootstrap.ts')
assert(exists('packages/native/deepLinks.ts'), 'Missing packages/native/deepLinks.ts')
assert(exists('packages/native/nativePush.ts'), 'Missing packages/native/nativePush.ts')
assert(exists('packages/native/offlineQueue.ts'), 'Missing packages/native/offlineQueue.ts')
assert(exists('packages/api/resolveBaseUrl.ts'), 'Missing packages/api/resolveBaseUrl.ts')
note('Shared API client', 'Yes', 'Yes', 'Yes', 'Complete')
note('Native plugin bridges', 'N/A', 'Fallbacks', 'Yes', 'Complete')

// --- AI orchestration shared ---
warn(
  exists('backend/src/services/ai/orchestration/pendingAction.service.ts'),
  'AI orchestration pending actions missing — AI confirm flows may be incomplete',
)
note('AI assistant', 'Yes', 'Yes', 'Yes (shared panel)', 'Complete')

// --- Auth / RBAC backend ---
assert(exists('backend/src/services/admin/adminCapabilities.ts'), 'Admin capability engine missing')
assert(exists('backend/src/services/admin/developmentAccess.service.ts'), 'Development Access service missing')
note('Admin RBAC engine', 'Yes', 'Yes', 'N/A (admin web-only)', 'Complete')

// --- Subscription entitlement ---
assert(exists('backend/src/services/marketplace/entitlements.service.ts'), 'Feature entitlement engine missing')
note('Feature entitlement engine', 'Yes', 'Yes', 'Yes (same APIs)', 'Complete')

// --- Google services example for FCM ---
warn(
  exists('android/app/google-services.json') || exists('android/app/google-services.json.example'),
  'Missing google-services.json(.example) for FCM',
)
note('Push notifications', 'Yes', 'VAPID', 'FCM (native)', 'Partial (channel differs)')

// --- Synced web assets ---
const publicIndex = path.join(ROOT, 'android', 'app', 'src', 'main', 'assets', 'public', 'index.html')
const distIndex = path.join(ROOT, 'dist', 'index.html')
if (requireSync) {
  assert(fs.existsSync(distIndex), 'dist/index.html missing — run npm run build')
  assert(fs.existsSync(publicIndex), 'android/.../assets/public/index.html missing — run npx cap sync android')
  if (fs.existsSync(distIndex) && fs.existsSync(publicIndex)) {
    const distM = fs.statSync(distIndex).mtimeMs
    const pubM = fs.statSync(publicIndex).mtimeMs
    warn(pubM >= distM - 2000, 'android assets/public is older than dist — run npm run mobile:sync')
  }
} else {
  warn(fs.existsSync(distIndex), 'dist/ not built yet (ok until first mobile sync)')
  warn(fs.existsSync(publicIndex), 'android assets/public not synced yet (run npm run mobile:sync)')
}
note('APK asset freshness', 'N/A', 'CDN live', 'Requires mobile:sync', 'Partial (ops)')

// --- Deep link admin strip ---
if (exists('packages/native/deepLinks.ts')) {
  const dl = read('packages/native/deepLinks.ts')
  warn(
    /admin/i.test(dl),
    'deepLinks.ts should document/handle admin paths on native (redirect or ignore)',
  )
}

console.log('Web ↔ Android parity check')
console.log('==========================')
console.log('\nFeature matrix snapshot:')
for (const row of matrix) {
  console.log(`  • ${row.feature}: ${row.status} (BE=${row.backend}, Web=${row.web}, Android=${row.android})`)
}
if (warnings.length) {
  console.log('\nWarnings:')
  for (const w of warnings) console.log(`  ⚠  ${w}`)
}

const reportPath = path.join(ROOT, 'scripts', '.web-android-parity-latest.json')
try {
  fs.writeFileSync(
    reportPath,
    JSON.stringify(
      {
        generatedAt: new Date().toISOString(),
        passed: errors.length === 0,
        errors,
        warnings,
        matrix,
      },
      null,
      2,
    ),
  )
} catch {
  /* non-fatal */
}

if (errors.length) {
  console.log('\nFailures:')
  for (const e of errors) console.log(`  ✖  ${e}`)
  console.log(`\nFAILED (${errors.length} error(s))`)
  process.exit(1)
}
console.log('\nPASSED — shared SPA is the single source of truth for Capacitor Android.')
process.exit(0)
