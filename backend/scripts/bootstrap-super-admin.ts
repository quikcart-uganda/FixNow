/**
 * One-time Super Admin bootstrap CLI.
 *
 * Usage:
 *   cd backend
 *   npx tsx scripts/bootstrap-super-admin.ts --email you@company.com --name "Your Name"
 *
 * Or set ADMIN_BOOTSTRAP_EMAIL / ADMIN_BOOTSTRAP_NAME / ADMIN_BOOTSTRAP_PASSWORD in .env
 * (password via env is refused when NODE_ENV/APP_ENV=production).
 *
 * Prints a Bootstrap Recovery Key ONCE — store it offline.
 */

import readline from 'node:readline/promises';
import { stdin as input, stdout as output } from 'node:process';
import { connectDatabase, disconnectDatabase } from '../src/config/database.js';
import { env } from '../src/config/env.js';
import { adminIdentityService } from '../src/services/admin/adminIdentity.service.js';

function arg(name: string): string | undefined {
  const idx = process.argv.indexOf(`--${name}`);
  if (idx >= 0 && process.argv[idx + 1]) return process.argv[idx + 1];
  return undefined;
}

async function promptSecret(label: string): Promise<string> {
  const rl = readline.createInterface({ input, output });
  try {
    // Basic prompt — operators should prefer a TTY; CI should use env outside production.
    const value = await rl.question(label);
    return value.trim();
  } finally {
    rl.close();
  }
}

async function main() {
  await connectDatabase();

  const status = await adminIdentityService.bootstrapStatus();
  if (status.completed) {
    console.error('[bootstrap-super-admin] Already completed. Refusing to create another Super Admin.');
    console.error(`  Active Super Admins: ${status.superAdminCount}`);
    process.exitCode = 1;
    await disconnectDatabase();
    return;
  }

  const email = (arg('email') || env.ADMIN_BOOTSTRAP_EMAIL || '').trim().toLowerCase();
  const fullName = (arg('name') || env.ADMIN_BOOTSTRAP_NAME || '').trim();
  if (!email || !fullName) {
    console.error('Usage: tsx scripts/bootstrap-super-admin.ts --email you@company.com --name "Full Name"');
    process.exitCode = 1;
    await disconnectDatabase();
    return;
  }

  let password = arg('password') || env.ADMIN_BOOTSTRAP_PASSWORD || '';
  if (password && env.isProductionEnv) {
    console.error('[bootstrap-super-admin] Refusing ADMIN_BOOTSTRAP_PASSWORD in production. Enter interactively.');
    password = '';
  }
  if (!password) {
    password = await promptSecret('Super Admin password (12+ chars, upper/lower/number/symbol): ');
    const confirm = await promptSecret('Confirm password: ');
    if (password !== confirm) {
      console.error('Passwords do not match.');
      process.exitCode = 1;
      await disconnectDatabase();
      return;
    }
  }

  const result = await adminIdentityService.bootstrapSuperAdmin({
    email,
    fullName,
    password,
  });

  console.log('\n[bootstrap-super-admin] Success');
  console.log(`  Email:    ${result.email}`);
  console.log(`  User ID:  ${result.userId}`);
  console.log(`  Admin ID: ${result.adminUserId}`);
  console.log('\n*** BOOTSTRAP RECOVERY KEY (store offline — shown once) ***');
  console.log(`  ${result.bootstrapRecoveryKey}`);
  console.log('****************************************************************\n');
  console.log(result.message);

  await disconnectDatabase();
}

main().catch(async (err) => {
  console.error('[bootstrap-super-admin] Failed', err);
  try {
    await disconnectDatabase();
  } catch {
    /* ignore */
  }
  process.exit(1);
});
