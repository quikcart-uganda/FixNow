/**
 * Regression: Capacitor plugin proxies must not cross await as bare thenables.
 * Run: node scripts/test-cap-plugin-thenable.mjs
 *
 * Capacitor's Proxy get('then') returns a wrapper that ignores Promise
 * resolve/reject callbacks and returns a separate rejecting promise — so the
 * adopting promise hangs forever while an unhandled rejection fires.
 */
function wrapCapPlugin(plugin) {
  return { plugin: plugin ?? null }
}

function fakeCapacitorPlugin(name) {
  const plugin = {
    get: async () => 'ok',
  }
  Object.defineProperty(plugin, 'then', {
    enumerable: false,
    value(..._args) {
      // Do not call Promise resolve/reject callbacks (args[0]/args[1]).
      const rejected = Promise.reject(
        new Error(`"${name}.then()" is not implemented on android`),
      )
      rejected.catch(() => {})
      return rejected
    },
  })
  return plugin
}

async function buggyLoad() {
  return fakeCapacitorPlugin('SecureStorage')
}

async function fixedLoad() {
  return wrapCapPlugin(fakeCapacitorPlugin('SecureStorage'))
}

async function race(fn) {
  return Promise.race([
    fn().then(
      (v) => ({ kind: 'resolved', v }),
      (e) => ({ kind: 'rejected', e: String(e && e.message ? e.message : e) }),
    ),
    new Promise((resolve) => setTimeout(() => resolve({ kind: 'hung' }), 250)),
  ])
}

const buggy = await race(async () => {
  const p = await buggyLoad()
  return p.get()
})

const fixed = await race(async () => {
  const { plugin: p } = await fixedLoad()
  return p.get()
})

console.log(JSON.stringify({ buggy, fixed }, null, 2))

if (fixed.kind !== 'resolved' || fixed.v !== 'ok') {
  console.error('FAIL: fixed wrapCapPlugin path did not resolve')
  process.exit(1)
}
if (buggy.kind !== 'hung') {
  console.error(`FAIL: expected buggy path to hang, got ${buggy.kind}`)
  process.exit(1)
}
console.log('PASS: bare plugin return hangs; wrapCapPlugin works')
