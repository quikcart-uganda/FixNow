/**
 * Assemble the FixNow Android debug APK using JDK 21.
 *
 * Usage:
 *   npm run android:assemble
 *   node scripts/android-assemble.mjs
 *   node scripts/android-assemble.mjs assembleRelease
 */

import { spawnSync } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { requireJdk21 } from './android-jdk.mjs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(__dirname, '..')
const ANDROID = path.join(ROOT, 'android')
const task = process.argv[2] || 'assembleDebug'

const { home, major } = requireJdk21()
console.log(`[android-assemble] Using JDK ${major}: ${home}`)
console.log(`[android-assemble] Task: ${task}`)

const gradlew = process.platform === 'win32' ? 'gradlew.bat' : './gradlew'
const result = spawnSync(gradlew, [task, '--stacktrace'], {
  cwd: ANDROID,
  env: {
    ...process.env,
    JAVA_HOME: home,
    // Prefer the discovered JDK over a stale system JAVA_HOME of 17.
    PATH: `${path.join(home, 'bin')}${path.delimiter}${process.env.PATH || ''}`,
  },
  stdio: 'inherit',
  shell: false,
})

if (result.status !== 0) {
  console.error('\n[android-assemble] FAILED. Run: npm run android:validate')
  process.exit(result.status || 1)
}

console.log(`\n[android-assemble] SUCCESS — ${task}`)
if (task === 'assembleDebug') {
  console.log('APK: android/app/build/outputs/apk/debug/app-debug.apk')
}
