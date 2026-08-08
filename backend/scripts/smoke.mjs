/**
 * Lightweight smoke — health probes + optional auth handshake.
 * Does not require full marketplace seed; safe as a preflight.
 *
 *   node scripts/smoke.mjs
 *   node scripts/smoke.mjs --full   # also runs domain e2e scripts
 */

import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { api, assert, getOrigin, uniqueEmail, registerAndLogin } from './_helpers/index.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const full = process.argv.includes('--full');

async function probe(url) {
  const res = await fetch(url, { headers: { Accept: 'application/json' } });
  const json = await res.json().catch(() => null);
  return { status: res.status, json };
}

function runScript(name) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [path.join(__dirname, name)], {
      stdio: 'inherit',
      env: process.env,
      cwd: path.join(__dirname, '..'),
    });
    child.on('exit', (code) => {
      if (code === 0) resolve();
      else reject(new Error(`${name} exited with ${code}`));
    });
  });
}

async function main() {
  const origin = getOrigin();
  console.log(`Smoke against ${origin}`);

  console.log('1) /livez');
  const live = await probe(`${origin}/livez`);
  assert(live.status === 200, `livez ${live.status}`);

  console.log('2) /readyz');
  const ready = await probe(`${origin}/readyz`);
  assert(ready.status === 200 || ready.status === 503, `readyz ${ready.status}`);

  console.log('3) /health');
  const health = await probe(`${origin}/health`);
  assert(health.status === 200 || health.status === 503, `health ${health.status}`);

  console.log('4) /version');
  const version = await probe(`${origin}/version`);
  assert(version.status === 200, `version ${version.status}`);

  console.log('5) /diagnostics');
  const diag = await probe(`${origin}/diagnostics`);
  assert(diag.status === 200, `diagnostics ${diag.status}`);

  if (ready.status === 200) {
    console.log('6) Auth handshake (register/login)');
    const session = await registerAndLogin({
      email: uniqueEmail('smoke'),
      fullName: 'Smoke User',
      role: 'customer',
    });
    assert(session.token, 'smoke login token missing');

    console.log('7) Authenticated categories list');
    const cats = await api('GET', '/categories?limit=5', null, session.token);
    assert(cats.status === 200, `categories ${cats.status}`);
  } else {
    console.log('6) Skip auth handshake — Mongo not ready');
  }

  if (full) {
    console.log('— Full domain smoke —');
    const suite = [
      'auth-e2e.mjs',
      'marketplace-e2e.mjs',
      'payments-e2e.mjs',
      'messaging-e2e.mjs',
      'realtime-e2e.mjs',
      'reviews-e2e.mjs',
      'push-e2e.mjs',
      'cms-e2e.mjs',
    ];
    for (const script of suite) {
      console.log(`\n>>> ${script}`);
      await runScript(script);
    }
  }

  console.log('Smoke passed');
}

main().catch((err) => {
  console.error('Smoke FAILED', err);
  process.exit(1);
});
