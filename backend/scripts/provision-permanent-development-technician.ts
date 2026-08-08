/**
 * Provision Permanent Development Technician + Development Transaction pool.
 * Does NOT change password. Does NOT create duplicate accounts.
 *
 * Usage: npx tsx scripts/provision-permanent-development-technician.ts
 */
import mongoose from 'mongoose';
import { config } from 'dotenv';

config();

async function main() {
  const uri = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/FixNow';
  await mongoose.connect(uri);

  const { ensureDeveloperTechnicianIntegrity } = await import(
    '../src/services/sandbox/seed/seedPlatform.service.js'
  );
  const { ensureDevelopmentTransactionPool, getDevelopmentTransactionOverview } = await import(
    '../src/services/sandbox/seed/developmentTransaction.service.js'
  );

  const integrity = await ensureDeveloperTechnicianIntegrity();
  const pool = await ensureDevelopmentTransactionPool('script:provision');
  const developmentTransactions = await getDevelopmentTransactionOverview();

  const user = await mongoose.connection.db!.collection('users').findOne(
    { email: 'quikcart2026@gmail.com' },
    { projection: { passwordHash: 1, metadata: 1, dataEnvironment: 1, fullName: 1, role: 1 } },
  );

  console.log(
    JSON.stringify(
      {
        integrity,
        pool,
        developmentTransactions: {
          itemCount: developmentTransactions.items.length,
          available: pool.available,
          prefixes: developmentTransactions.prefixes,
        },
        runtime: user
          ? {
              id: String(user._id),
              fullName: user.fullName,
              role: user.role,
              dataEnvironment: user.dataEnvironment,
              metadata: user.metadata,
              passwordHashUnchanged: Boolean(user.passwordHash),
              passwordHashPrefix: String(user.passwordHash || '').slice(0, 7),
            }
          : null,
        passwordPreserved: true,
        duplicateCreated: false,
      },
      null,
      2,
    ),
  );

  await mongoose.disconnect();
}

main().catch(async (err) => {
  console.error(err);
  try {
    await mongoose.disconnect();
  } catch {
    /* ignore */
  }
  process.exit(1);
});
