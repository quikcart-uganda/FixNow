/**
 * Mock consistency notes + lightweight stubs for Node test runners.
 * Console providers remain the backend runtime stubs; this module
 * documents and mirrors client-side storage mocks for unit tests.
 */

/** In-memory sessionStorage stand-in for Node (no DOM). */
export function createSessionStorageMock() {
  const store = new Map();
  return {
    getItem(key) {
      return store.has(key) ? store.get(key) : null;
    },
    setItem(key, value) {
      store.set(String(key), String(value));
    },
    removeItem(key) {
      store.delete(String(key));
    },
    clear() {
      store.clear();
    },
    get length() {
      return store.size;
    },
    key(i) {
      return [...store.keys()][i] ?? null;
    },
  };
}

/** Install sessionStorage on globalThis for idempotency helpers. */
export function installSessionStorageMock() {
  const mock = createSessionStorageMock();
  Object.defineProperty(globalThis, 'sessionStorage', {
    value: mock,
    configurable: true,
    writable: true,
  });
  return mock;
}

/**
 * Canonical provider modes used in local quality gates.
 * Keep e2e scripts and docs aligned with these names.
 */
export const LOCAL_PROVIDER_MODE = {
  email: 'console',
  sms: 'console',
  push: 'console',
  payments: 'console',
  ai: 'console',
};
