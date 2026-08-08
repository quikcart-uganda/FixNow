/**
 * CLI entry for Seed Platform (Content Environment = sandbox only).
 *
 * Usage (from backend/):
 *   npx tsx scripts/seed-platform.ts
 *   npx tsx scripts/seed-platform.ts --modules=customers,jobs
 *   npx tsx scripts/seed-platform.ts --regenerate
 *   npx tsx scripts/seed-platform.ts --validate
 *
 * Refuses when APP_ENV/NODE_ENV is production.
 */

import dotenv from 'dotenv';
dotenv.config();

async function main() {
  const appEnv = String(process.env.APP_ENV || process.env.NODE_ENV || 'development').toLowerCase();
  if (appEnv === 'production') {
    console.error('[seed-platform] Refusing to run against production process environment.');
    process.exit(1);
  }

  const { connectDatabase } = await import('../src/config/database.js');
  await connectDatabase();

  const validateOnly = process.argv.includes('--validate');
  const regenerate = process.argv.includes('--regenerate');
  const modulesArg = process.argv.find((a) => a.startsWith('--modules='))?.slice('--modules='.length);
  const modules = modulesArg
    ? modulesArg.split(',').map((s) => s.trim()).filter(Boolean)
    : ['all'];

  if (validateOnly) {
    const { seedPlatformService } = await import('../src/services/sandbox/seed/seedPlatform.service.js');
    const result = await seedPlatformService.validateSeeds();
    console.log(JSON.stringify(result, null, 2));
    process.exit(result.ok ? 0 : 2);
  }

  const { generateSeedPlatform } = await import('../src/services/sandbox/seed/seedPlatform.generator.js');
  const result = await generateSeedPlatform({
    modules: modules as never[],
    regenerate,
  });
  console.log('[seed-platform] Complete');
  console.log(JSON.stringify(result, null, 2));
  process.exit(0);
}

main().catch((err) => {
  console.error('[seed-platform] Failed', err);
  process.exit(1);
});
