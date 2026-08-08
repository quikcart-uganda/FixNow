/**
 * Local quality gates — no CI required.
 *
 *   npm run test              # unit + component
 *   npm run test:unit
 *   npm run test:component
 */

import { spawn } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const root = path.resolve(__dirname, '..')

function collect(dir, predicate, acc = []) {
  if (!fs.existsSync(dir)) return acc
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      if (entry.name === 'node_modules' || entry.name === 'dist') continue
      collect(full, predicate, acc)
    } else if (predicate(entry.name, full)) {
      acc.push(full)
    }
  }
  return acc
}

const backendUnit = collect(path.join(root, 'backend', 'src'), (name) => name.endsWith('.test.ts'))
const packageUnit = [
  ...collect(path.join(root, 'packages', 'utils'), (name) => name.endsWith('.test.ts')),
  ...collect(path.join(root, 'packages', 'api'), (name) => name.endsWith('.test.ts')),
  ...collect(path.join(root, 'packages', 'native'), (name) => name.endsWith('.test.ts')),
]
const componentTests = [
  ...collect(path.join(root, 'packages', 'ui'), (name) => name.endsWith('.test.tsx')),
  ...collect(path.join(root, 'packages', 'shared'), (name) => name.endsWith('.test.tsx')),
]

function runNodeTest(label, cwd, files, extraArgs = [], extraEnv = {}) {
  if (!files.length) {
    console.log(`\n[test:${label}] no files — skip`)
    return Promise.resolve()
  }
  return new Promise((resolve, reject) => {
    const args = ['--import', 'tsx', ...extraArgs, '--test', ...files]
    console.log(`\n[test:${label}] ${files.length} file(s)`)
    const child = spawn(process.execPath, args, {
      cwd,
      stdio: 'inherit',
      env: { ...process.env, NODE_ENV: process.env.NODE_ENV || 'test', ...extraEnv },
    })
    child.on('exit', (code) => {
      if (code === 0) resolve()
      else reject(new Error(`${label} failed with exit ${code}`))
    })
  })
}

async function main() {
  const which = process.argv[2] || 'all'

  if (which === 'unit' || which === 'all') {
    await runNodeTest('backend-unit', path.join(root, 'backend'), backendUnit)
    await runNodeTest('package-unit', root, packageUnit)
  }
  if (which === 'component' || which === 'all') {
    await runNodeTest('component', root, componentTests, [], { TSX_TSCONFIG_PATH: path.join(root, 'tsconfig.app.json') })
  }

  console.log('\nAll selected quality tests passed')
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
