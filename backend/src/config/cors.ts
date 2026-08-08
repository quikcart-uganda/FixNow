import type { CorsOptions } from 'cors'
import { env } from './env.js'

/**
 * Private LAN + loopback origins for phones/tablets opening the Vite LAN URL.
 * Covers 10/8, 172.16–31/12, 192.168/16, localhost, and 127.0.0.1 with any port.
 */
const DEV_LAN_ORIGIN =
  /^https?:\/\/((localhost|127\.0\.0\.1)|10\.\d{1,3}\.\d{1,3}\.\d{1,3}|192\.168\.\d{1,3}\.\d{1,3}|172\.(1[6-9]|2\d|3[0-1])\.\d{1,3}\.\d{1,3})(:\d+)?$/i

const CAPACITOR_ORIGIN =
  /^(https:\/\/app\.fixnow\.local(:\d+)?|capacitor:\/\/|ionic:\/\/)/i

/** True when private LAN / Capacitor origins may be accepted (never in production). */
function allowDevClientOrigins(): boolean {
  return !env.isProduction && !env.isProductionEnv
}

/**
 * Shared allowlist used by CORS + CSRF so Guest/LAN mobile browsers stay consistent.
 */
export function isAllowedRequestOrigin(origin: string): boolean {
  if (!origin) return false
  if (env.corsOrigins.includes(origin)) return true
  if (!allowDevClientOrigins()) return false
  return DEV_LAN_ORIGIN.test(origin) || CAPACITOR_ORIGIN.test(origin)
}

export const corsOptions: CorsOptions = {
  origin(origin, callback) {
    // Non-browser clients (curl / health / native without Origin) — allow.
    if (!origin) {
      callback(null, true)
      return
    }
    if (isAllowedRequestOrigin(origin)) {
      callback(null, true)
      return
    }
    // Do not throw — throwing becomes a 403 without ACAO and browsers surface it as
    // a fake "No internet" Network Error. Reflect denial without an exception.
    if (allowDevClientOrigins()) {
      console.warn(`[cors] Denied origin (add to CORS_ORIGINS if intentional): ${origin}`)
    }
    callback(null, false)
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Request-Id', 'X-CSRF-Token', 'X-Guest-Session'],
}
