/**
 * Android JDK discovery for FixNow Capacitor builds.
 * Capacitor 8 / AGP 8.13 require JDK 21 (Android Studio JBR is preferred).
 */

import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { spawnSync } from 'node:child_process'

const CANDIDATES = [
  process.env.FIXNOW_JAVA_HOME,
  process.env.JAVA_HOME,
  'C:\\Program Files\\Android\\Android Studio\\jbr',
  path.join(process.env.LOCALAPPDATA || '', 'Programs', 'Android', 'Android Studio', 'jbr'),
  'C:\\Program Files\\Microsoft\\jdk-21*',
  'C:\\Program Files\\Eclipse Adoptium\\jdk-21*',
  'C:\\Program Files\\Java\\jdk-21*',
  '/Applications/Android Studio.app/Contents/jbr/Contents/Home',
  `${os.homedir()}/Library/Java/JavaVirtualMachines`,
].filter(Boolean)

function expandGlobs(pattern) {
  if (!pattern.includes('*')) return [pattern]
  const dir = path.dirname(pattern)
  const prefix = path.basename(pattern).replace('*', '')
  if (!fs.existsSync(dir)) return []
  return fs
    .readdirSync(dir)
    .filter((name) => name.startsWith(prefix))
    .map((name) => path.join(dir, name))
}

function javaMajor(javaHome) {
  const javaBin = path.join(javaHome, 'bin', process.platform === 'win32' ? 'java.exe' : 'java')
  if (!fs.existsSync(javaBin)) return 0
  const result = spawnSync(javaBin, ['-version'], { encoding: 'utf8' })
  const text = `${result.stdout || ''}${result.stderr || ''}${result.error?.message || ''}`
  return parseMajor(text)
}

function parseMajor(text) {
  const m = String(text).match(/version "(\d+)/i) || String(text).match(/openjdk version "(\d+)/i)
  return m ? Number(m[1]) : 0
}

export function findJdk21Home() {
  const tried = []
  for (const raw of CANDIDATES) {
    for (const candidate of expandGlobs(String(raw))) {
      if (!candidate || !fs.existsSync(candidate)) continue
      // macOS Android Studio nests Home under Contents
      const homes = [
        candidate,
        path.join(candidate, 'Contents', 'Home'),
        path.join(candidate, 'Home'),
      ]
      for (const home of homes) {
        if (!fs.existsSync(path.join(home, 'bin'))) continue
        const major = javaMajor(home)
        tried.push({ home, major })
        if (major >= 21) return { home, major, tried }
      }
    }
  }
  return { home: null, major: 0, tried }
}

export function requireJdk21() {
  const result = findJdk21Home()
  if (!result.home) {
    const detail = result.tried.length
      ? result.tried.map((t) => `  - ${t.home} (Java ${t.major || '?'})`).join('\n')
      : '  (no JDK candidates found)'
    throw new Error(
      [
        'FixNow Android builds require JDK 21+.',
        'Install Android Studio (includes JBR 21) or a JDK 21 runtime, then either:',
        '  1. Set FIXNOW_JAVA_HOME to the JDK 21 home, or',
        '  2. Set JAVA_HOME to JDK 21 before running Gradle.',
        'Candidates checked:',
        detail,
      ].join('\n'),
    )
  }
  return result
}
