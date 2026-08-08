/**
 * Local regression orchestrator — no CI required.
 * Runs unit tests, then (if --live) smoke + domain e2e.
 *
 *   node scripts/regression.mjs
 *   node scripts/regression.mjs --live
 */

import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '../..');
const live = process.argv.includes('--live');

function run(cmd, args, cwd = root) {
  return new Promise((resolve, reject) => {
    console.log(`\n$ ${cmd} ${args.join(' ')}`);
    const child = spawn(cmd, args, { stdio: 'inherit', cwd, shell: process.platform === 'win32', env: process.env });
    child.on('exit', (code) => {
      if (code === 0) resolve();
      else reject(new Error(`Command failed (${code}): ${cmd} ${args.join(' ')}`));
    });
  });
}

async function main() {
  console.log('FixNow regression suite (local)');

  await run('npm', ['run', 'test:unit'], root);

  if (live) {
    await run('node', ['scripts/smoke.mjs', '--full'], path.join(root, 'backend'));
  } else {
    console.log('\n(Skipping live API e2e — pass --live when API + Mongo are up)');
  }

  console.log('\nRegression suite completed');
}

main().catch((err) => {
  console.error('Regression FAILED', err);
  process.exit(1);
});
