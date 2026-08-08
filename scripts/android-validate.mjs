/**
 * Preflight validation for FixNow Android builds.
 *
 * Usage:
 *   npm run android:validate
 *   node scripts/android-validate.mjs --strict
 *
 * Exit 0 = ready for Gradle sync / assembleDebug
 * Exit 1 = actionable blockers printed
 */

import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { execFileSync, execSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { findJdk21Home } from './android-jdk.mjs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(__dirname, '..')
const ANDROID = path.join(ROOT, 'android')
const strict = process.argv.includes('--strict')

const errors = []
const warnings = []
const info = []

function exists(rel) {
  return fs.existsSync(path.join(ROOT, rel))
}

function assert(cond, msg) {
  if (!cond) errors.push(msg)
}

function warn(cond, msg) {
  if (!cond) warnings.push(msg)
}

function note(msg) {
  info.push(msg)
}

function readEnvFile(rel) {
  const full = path.join(ROOT, rel)
  if (!fs.existsSync(full)) return {}
  const out = {}
  for (const line of fs.readFileSync(full, 'utf8').split(/\r?\n/)) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const eq = trimmed.indexOf('=')
    if (eq < 0) continue
    out[trimmed.slice(0, eq).trim()] = trimmed.slice(eq + 1).trim()
  }
  return out
}

function detectLanIpv4() {
  const ifaces = os.networkInterfaces()
  for (const entries of Object.values(ifaces)) {
    for (const entry of entries || []) {
      if (entry.family !== 'IPv4' || entry.internal) continue
      const h = entry.address
      if (
        /^192\.168\./.test(h) ||
        /^10\./.test(h) ||
        /^172\.(1[6-9]|2\d|3[0-1])\./.test(h)
      ) {
        return h
      }
    }
  }
  return null
}

// --- Workspace root ---
assert(exists('package.json'), 'Run from FixNow repo root (package.json missing)')
assert(exists('capacitor.config.ts'), 'Missing capacitor.config.ts — wrong directory?')
assert(exists('android/settings.gradle'), 'Missing android/settings.gradle')
assert(exists('android/gradlew.bat') || exists('android/gradlew'), 'Missing Gradle wrapper')

const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'))
assert(pkg.name === 'fixnow-app', `Expected package name fixnow-app, got ${pkg.name}`)

// --- Node modules / Capacitor ---
assert(exists('node_modules/@capacitor/android'), 'Run npm install — @capacitor/android missing')
assert(exists('node_modules/@capacitor/cli'), 'Run npm install — @capacitor/cli missing')
assert(
  exists('android/capacitor.settings.gradle'),
  'Missing android/capacitor.settings.gradle — run: npx cap sync android',
)

// --- JDK 21 ---
const jdk = findJdk21Home()
if (jdk.home) {
  note(`JDK ${jdk.major} ready: ${jdk.home}`)
} else {
  assert(false, 'JDK 21+ required. Install Android Studio or set FIXNOW_JAVA_HOME / JAVA_HOME to JDK 21.')
}

// --- Android SDK ---
const localProps = path.join(ANDROID, 'local.properties')
if (fs.existsSync(localProps)) {
  const text = fs.readFileSync(localProps, 'utf8')
  const m = text.match(/^\s*sdk\.dir\s*=\s*(.+)\s*$/m)
  if (m) {
    const sdkDir = m[1].replace(/\\\\/g, '\\').replace(/\\:/g, ':')
    // Don't print full path in normal mode — just confirm existence of key pieces
    const platformTools = path.join(sdkDir.replace(/^"(.*)"$/, '$1'), 'platform-tools')
    warn(fs.existsSync(sdkDir.replace(/^"(.*)"$/, '$1')), 'android/local.properties sdk.dir does not exist on disk')
    note('android/local.properties present (SDK path configured)')
    if (fs.existsSync(path.join(platformTools, process.platform === 'win32' ? 'adb.exe' : 'adb'))) {
      note('ADB found under configured SDK platform-tools')
    }
  } else {
    warnings.push('android/local.properties exists but sdk.dir is missing')
  }
} else {
  errors.push(
    'Missing android/local.properties. Open the project once in Android Studio or create it with sdk.dir=<Android SDK path>.',
  )
}

// --- Web build / sync assets ---
warn(exists('dist/index.html'), 'dist/ missing — run npm run build before cap sync')
warn(
  exists('android/app/src/main/assets/public/index.html'),
  'Synced web assets missing — run: npx cap sync android',
)

// --- Secrets (non-fatal for debug) ---
warn(
  exists('android/app/google-services.json'),
  'android/app/google-services.json missing — push notifications disabled (copy from google-services.json.example after Firebase setup)',
)
warn(
  exists('android/keystore.properties'),
  'android/keystore.properties missing — release signing unavailable (debug builds still work)',
)

// --- Network / env ---
const env = { ...readEnvFile('.env'), ...readEnvFile('.env.local') }
const apiUrl = env.VITE_API_URL || ''
const lanHost = env.VITE_DEV_LAN_HOST || env.VITE_ANDROID_API_HOST || ''
const detectedLan = detectLanIpv4()

if (/localhost|127\.0\.0\.1/.test(apiUrl) && !lanHost) {
  warnings.push(
    [
      'VITE_API_URL uses localhost and VITE_DEV_LAN_HOST is unset.',
      '  Emulator: OK (rewrites to 10.0.2.2).',
      `  Physical device: set VITE_DEV_LAN_HOST=${detectedLan || '<your-pc-lan-ip>'} then rebuild + sync.`,
    ].join('\n'),
  )
} else if (lanHost) {
  note(`VITE_DEV_LAN_HOST=${lanHost}`)
}

if (detectedLan) note(`Detected LAN IPv4: ${detectedLan}`)

// --- Network security configs ---
assert(
  exists('android/app/src/debug/res/xml/network_security_config.xml'),
  'Missing debug network_security_config (cleartext for emulator/LAN)',
)
assert(
  exists('android/app/src/main/res/xml/network_security_config.xml'),
  'Missing release network_security_config',
)

// --- Manifest / app module ---
assert(exists('android/app/src/main/AndroidManifest.xml'), 'Missing AndroidManifest.xml')
assert(exists('android/app/src/main/java/com/fixnow/app/MainActivity.java'), 'Missing MainActivity')
assert(exists('android/app/build.gradle'), 'Missing android/app/build.gradle')

// --- Gradle offline / wrapper ---
assert(exists('android/gradle/wrapper/gradle-wrapper.properties'), 'Missing Gradle wrapper properties')
const wrapper = fs.readFileSync(path.join(ANDROID, 'gradle/wrapper/gradle-wrapper.properties'), 'utf8')
assert(/gradle-8\.14\.3/.test(wrapper), 'Expected Gradle wrapper 8.14.3')

// --- ADB devices (informational) ---
try {
  const adbOut = execSync('adb devices', { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] })
  const devices = adbOut
    .split(/\r?\n/)
    .slice(1)
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith('*') && l.includes('device'))
  if (devices.length) note(`ADB devices: ${devices.map((d) => d.split(/\s+/)[0]).join(', ')}`)
  else warnings.push('No ADB devices/emulators attached — connect a phone with USB debugging or start an emulator')
} catch {
  warnings.push('adb not on PATH — install platform-tools or open a terminal from Android Studio')
}

// --- Optional strict Gradle probe ---
if (strict && jdk.home && errors.length === 0) {
  try {
    note('Running Gradle :app:tasks (strict)…')
    const gradlew = process.platform === 'win32' ? 'gradlew.bat' : './gradlew'
    execFileSync(gradlew, [':app:tasks', '--quiet'], {
      cwd: ANDROID,
      env: { ...process.env, JAVA_HOME: jdk.home },
      stdio: 'inherit',
    })
  } catch {
    errors.push('Gradle :app:tasks failed — see output above (repositories, SDK, or plugin errors)')
  }
}

// --- Report ---
console.log('\n=== FixNow Android validation ===\n')
for (const line of info) console.log(`INFO  ${line}`)
for (const line of warnings) console.log(`WARN  ${line}`)
for (const line of errors) console.log(`ERROR ${line}`)

if (errors.length) {
  console.log(`\nFAILED — ${errors.length} blocker(s). Fix the ERROR lines above, then retry.\n`)
  process.exit(1)
}

console.log(`\nOK — Android project is ready for Gradle sync / assembleDebug${warnings.length ? ` (${warnings.length} warning(s))` : ''}.\n`)
process.exit(0)
