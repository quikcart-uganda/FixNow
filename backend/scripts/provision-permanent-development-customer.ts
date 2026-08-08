/**
 * Provision Permanent Seed Customer (migrate existing account in place).
 * Does NOT change password. Does NOT create duplicate accounts.
 *
 * Usage: npx tsx scripts/provision-permanent-development-customer.ts
 */
import mongoose from 'mongoose';
import { config } from 'dotenv';

config();

async function main() {
  const uri = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/FixNow';
  await mongoose.connect(uri);

  const { ensureDeveloperCustomerIntegrity } = await import(
    '../src/services/sandbox/seed/seedCustomer.integrity.js'
  );
  const { DEVELOPER_CUSTOMER } = await import('../src/services/sandbox/seed/constants.js');

  const before = await mongoose.connection.db!.collection('users').findOne(
    { email: DEVELOPER_CUSTOMER.email.toLowerCase() },
    { projection: { passwordHash: 1, email: 1, role: 1 } },
  );
  const passwordHashBefore = before?.passwordHash ? String(before.passwordHash) : null;

  const integrity = await ensureDeveloperCustomerIntegrity();

  const after = await mongoose.connection.db!.collection('users').findOne(
    { email: DEVELOPER_CUSTOMER.email.toLowerCase() },
    { projection: { passwordHash: 1, metadata: 1, dataEnvironment: 1, fullName: 1, role: 1 } },
  );
  const passwordHashAfter = after?.passwordHash ? String(after.passwordHash) : null;

  const duplicateCount = await mongoose.connection.db!.collection('users').countDocuments({
    email: DEVELOPER_CUSTOMER.email.toLowerCase(),
  });

  console.log(
    JSON.stringify(
      {
        integrity,
        runtime: after
          ? {
              id: String(after._id),
              fullName: after.fullName,
              role: after.role,
              dataEnvironment: after.dataEnvironment,
              metadata: after.metadata,
            }
          : null,
        passwordPreserved:
          Boolean(passwordHashBefore) &&
          Boolean(passwordHashAfter) &&
          passwordHashBefore === passwordHashAfter,
        passwordHashPrefix: passwordHashAfter ? passwordHashAfter.slice(0, 7) : null,
        duplicateCreated: false,
        duplicateCount,
        email: DEVELOPER_CUSTOMER.email,
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
