/**
 * Capacitor plugin proxies are thenables: `plugin.then()` always rejects with
 * `"X.then() is not implemented on <platform>"`. Returning a plugin from an
 * `async` function or Promise `.then()` therefore *adopts* that thenable and
 * hangs forever (callbacks are never invoked) while emitting an unhandled
 * rejection — which is exactly how Android cold-start white-screens.
 *
 * Always cross an `await` boundary with a plain `{ plugin }` carrier, then
 * destructure the real proxy for method calls.
 */

export type CapPluginRef<T> = { plugin: T | null }

/** Plain carrier so Promise resolution never sees the Capacitor thenable. */
export function wrapCapPlugin<T>(plugin: T | null | undefined): CapPluginRef<T> {
  return { plugin: plugin ?? null }
}
