/**
 * Shared HTTP helper for FixNow API smoke / e2e scripts.
 * Keeps fetch + assertion conventions consistent across suites.
 */

export function getApiBase() {
  return process.env.API_BASE || 'http://localhost:4000/api/v1';
}

export function getSocketUrl() {
  return process.env.SOCKET_URL || 'http://localhost:4000';
}

export function getOrigin() {
  return process.env.API_ORIGIN || 'http://localhost:4000';
}

export async function api(method, path, body, token, options = {}) {
  const headers = { Accept: 'application/json', ...(options.headers || {}) };
  if (body !== undefined && body !== null && !(body instanceof FormData)) {
    headers['Content-Type'] = headers['Content-Type'] || 'application/json';
  }
  if (token) headers.Authorization = `Bearer ${token}`;

  const res = await fetch(`${getApiBase()}${path}`, {
    method,
    headers,
    body:
      body === undefined || body === null
        ? undefined
        : body instanceof FormData
          ? body
          : JSON.stringify(body),
    signal: options.signal,
  });
  const json = await res.json().catch(() => null);
  return { status: res.status, json, headers: res.headers };
}

export function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

export function assertOk(res, label) {
  assert(
    res.status >= 200 && res.status < 300,
    `${label} → HTTP ${res.status} ${JSON.stringify(res.json)}`,
  );
}

export function uniqueEmail(prefix = 'user') {
  return `${prefix}.${Date.now()}.${Math.random().toString(36).slice(2, 7)}@fixnow.test`;
}

export const DEFAULT_PASSWORD = 'Password1';
