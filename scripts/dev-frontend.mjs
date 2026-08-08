#!/usr/bin/env node
/**
 * FixNow frontend dev launcher.
 *
 * Why this exists:
 * - A single Vite process serves Customer + Technician + Admin (path portals).
 * - Cold starts can look "up" (process alive, port listening) while HTTP is held
 *   during dependency optimization — browsers then show refused/timeout errors.
 * - This wrapper starts Vite, waits for a real HTTP 200, and prints LAN URLs.
 *
 * Windows dual-stack note:
 * Vite with `server.host: true` binds IPv6 `::` (often dual-stack). Checking only
 * `0.0.0.0` can report the port free while `::` is occupied — then the child Vite
 * exits with EADDRINUSE and this launcher prints "Vite exited unexpectedly".
 * Port checks must cover both address families.
 */
import { spawn } from 'node:child_process'
import http from 'node:http'
import { createServer } from 'node:net'
import { networkInterfaces } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const PORT = Number(process.env.PORT || process.env.VITE_PORT || 5173)
const HOST_CHECK = '127.0.0.1'
const READY_TIMEOUT_MS = Number(process.env.FIXNOW_DEV_READY_TIMEOUT_MS || 180_000)
const PER_REQUEST_MS = Number(process.env.FIXNOW_DEV_PROBE_MS || 45_000)
const POLL_MS = 750

function lanIPv4s() {
  const out = []
  for (const list of Object.values(networkInterfaces())) {
    for (const net of list || []) {
      if (net.family === 'IPv4' && !net.internal) out.push(net.address)
    }
  }
  return [...new Set(out)]
}

/**
 * Attempt to bind `port` on `host`.
 * @returns {Promise<{ free: boolean, code?: string }>}
 */
function tryBind(port, host) {
  return new Promise((resolve) => {
    const server = createServer()
    server.once('error', (err) => {
      const code = err && typeof err === 'object' && 'code' in err ? String(err.code) : 'ERROR'
      // Family unsupported on this host — treat as "not blocking Vite".
      if (code === 'EAFNOSUPPORT' || code === 'EADDRNOTAVAIL' || code === 'EINVAL') {
        resolve({ free: true, code })
        return
      }
      resolve({ free: false, code })
    })
    server.once('listening', () => {
      server.close(() => resolve({ free: true }))
    })
    try {
      server.listen(port, host)
    } catch (err) {
      const code = err && typeof err === 'object' && 'code' in err ? String(err.code) : 'ERROR'
      resolve({ free: false, code })
    }
  })
}

/**
 * Vite (`host: true`) needs the port free on IPv4 and IPv6 when both exist.
 * Checking only 0.0.0.0 is a false-negative on Windows when :: already listens.
 */
async function isPortFreeForVite(port) {
  const ipv4 = await tryBind(port, '0.0.0.0')
  const ipv6 = await tryBind(port, '::')
  if (!ipv4.free && ipv4.code === 'EADDRINUSE') return { free: false, detail: 'IPv4 0.0.0.0 in use' }
  if (!ipv6.free && ipv6.code === 'EADDRINUSE') return { free: false, detail: 'IPv6 :: in use' }
  if (!ipv4.free) return { free: false, detail: `IPv4 bind failed (${ipv4.code})` }
  if (!ipv6.free) return { free: false, detail: `IPv6 bind failed (${ipv6.code})` }
  return { free: true, detail: 'ok' }
}

/**
 * Probe with node:http (not undici fetch): more reliable for local Vite on Windows
 * dual-stack listeners, and avoids AbortController noise masking connect failures.
 */
function httpGetStatus(url, perRequestMs) {
  return new Promise((resolve) => {
    let settled = false
    const finish = (result) => {
      if (settled) return
      settled = true
      resolve(result)
    }
    const req = http.get(url, { timeout: perRequestMs }, (res) => {
      res.resume()
      finish({ ok: res.statusCode >= 200 && res.statusCode < 500, status: res.statusCode })
    })
    req.on('timeout', () => {
      req.destroy()
      finish({ ok: false, error: 'timeout' })
    })
    req.on('error', (err) => {
      finish({ ok: false, error: err instanceof Error ? err.message : String(err) })
    })
  })
}

async function waitForHttp(url, timeoutMs, perRequestMs = PER_REQUEST_MS) {
  const started = Date.now()
  let lastErr = 'not started'
  while (Date.now() - started < timeoutMs) {
    const remaining = timeoutMs - (Date.now() - started)
    // One in-flight probe at a time. Short aborts (< first transform time) cancel
    // Vite work and leave the port listening while HTTP never completes.
    const result = await httpGetStatus(url, Math.min(perRequestMs, Math.max(1_000, remaining)))
    if (result.ok) return { ok: true, status: result.status }
    lastErr = result.error || `HTTP ${result.status}`
    await new Promise((r) => setTimeout(r, POLL_MS))
  }
  return { ok: false, error: lastErr }
}

function printBanner(extra = []) {
  const lans = lanIPv4s()
  console.log('')
  console.log('╔══════════════════════════════════════════════════════════╗')
  console.log('║              FixNow frontend is reachable                ║')
  console.log('╠══════════════════════════════════════════════════════════╣')
  console.log(`║  Local:      http://localhost:${PORT}/`.padEnd(61) + '║')
  for (const ip of lans) {
    const line = `║  Network:    http://${ip}:${PORT}/`
    console.log(line.padEnd(61) + '║')
  }
  console.log('║  Customer:   /customer                                   ║')
  console.log('║  Technician: /technician                                 ║')
  console.log('║  Admin:      /admin                                      ║')
  for (const line of extra) {
    console.log(('║  ' + line).padEnd(61) + '║')
  }
  console.log('╚══════════════════════════════════════════════════════════╝')
  console.log('')
}

async function main() {
  // Prefer reuse when something is already serving — avoids dual-stack false "free".
  const existing = await waitForHttp(`http://${HOST_CHECK}:${PORT}/`, 8_000, 8_000)
  if (existing.ok) {
    console.log(`[fixnow:dev] Port ${PORT} already serving (HTTP ${existing.status}).`)
    printBanner(['Note: reused existing Vite process'])
    await new Promise(() => {})
    return
  }

  const availability = await isPortFreeForVite(PORT)
  if (!availability.free) {
    // Port is taken. First HTML/CSS transform can exceed the short reuse window —
    // retry once with the full probe budget before calling the listener "stale".
    console.log(
      `[fixnow:dev] Port ${PORT} is bound (${availability.detail}); re-checking HTTP (slow first transform)…`,
    )
    const retry = await waitForHttp(`http://${HOST_CHECK}:${PORT}/`, PER_REQUEST_MS, PER_REQUEST_MS)
    if (retry.ok) {
      console.log(`[fixnow:dev] Port ${PORT} already serving (HTTP ${retry.status}).`)
      printBanner(['Note: reused existing Vite process'])
      await new Promise(() => {})
      return
    }
    console.error(`[fixnow:dev] Port ${PORT} is occupied but not serving HTTP.`)
    console.error(`[fixnow:dev] Detail: ${availability.detail}`)
    console.error('[fixnow:dev] Stop the stale Node/Vite process, then re-run: npm run dev')
    console.error(`[fixnow:dev] Last HTTP probe error: ${retry.error || existing.error}`)
    process.exit(1)
  }

  const viteBin = path.join(ROOT, 'node_modules', 'vite', 'bin', 'vite.js')
  const child = spawn(process.execPath, [viteBin, ...process.argv.slice(2)], {
    cwd: ROOT,
    stdio: ['inherit', 'pipe', 'pipe'],
    env: {
      ...process.env,
      FORCE_COLOR: process.env.FORCE_COLOR || '1',
    },
  })

  let ready = false
  let sawAddrInUse = false
  const forward = (chunk, stream) => {
    const text = chunk.toString()
    if (/Port .* is already in use|EADDRINUSE/i.test(text)) {
      sawAddrInUse = true
    }
    stream.write(chunk)
  }
  child.stdout?.on('data', (c) => forward(c, process.stdout))
  child.stderr?.on('data', (c) => forward(c, process.stderr))

  child.on('exit', (code, signal) => {
    const reason = signal ? `signal ${signal}` : `exit code ${code ?? 1}`
    if (!ready) {
      console.error(`[fixnow:dev] Vite exited unexpectedly (${reason}).`)
      if (sawAddrInUse) {
        console.error(
          `[fixnow:dev] Root cause: port ${PORT} was taken (often IPv6 :: while IPv4 looked free).`,
        )
        console.error('[fixnow:dev] Stop the existing Vite/Node listener on that port, then retry.')
      } else {
        console.error('[fixnow:dev] Check the stack trace above. Vite did not stay alive.')
      }
      process.exit(code ?? 1)
      return
    }
    console.error(`[fixnow:dev] Vite stopped (${reason}).`)
    process.exit(code ?? 1)
  })

  const probe = await waitForHttp(`http://${HOST_CHECK}:${PORT}/`, READY_TIMEOUT_MS)
  if (!probe.ok) {
    console.error(`[fixnow:dev] Vite did not become reachable within ${READY_TIMEOUT_MS}ms.`)
    console.error(`[fixnow:dev] Last error: ${probe.error}`)
    console.error('[fixnow:dev] Killing the hung Vite process to avoid a zombie listener.')
    try {
      child.kill('SIGTERM')
    } catch {
      /* ignore */
    }
    process.exit(1)
  }

  ready = true
  printBanner([`Validated HTTP ${probe.status} on 127.0.0.1:${PORT}`])

  const shutdown = () => {
    try {
      child.kill('SIGTERM')
    } catch {
      /* ignore */
    }
  }
  process.on('SIGINT', shutdown)
  process.on('SIGTERM', shutdown)
}

main().catch((err) => {
  console.error('[fixnow:dev] Launcher failed:', err)
  process.exit(1)
})
