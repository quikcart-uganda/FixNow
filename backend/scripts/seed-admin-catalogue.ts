/** Seeds permission + role catalogue without creating operators. */
import { connectDatabase, disconnectDatabase } from '../src/config/database.js';
import { adminIdentityService } from '../src/services/admin/adminIdentity.service.js';

async function main() {
  await connectDatabase();
  const result = await adminIdentityService.seedCatalogue();
  console.log('[seed-admin-catalogue]', result);
  await disconnectDatabase();
}

main().catch(async (err) => {
  console.error(err);
  try {
    await disconnectDatabase();
  } catch {
    /* ignore */
  }
  process.exit(1);
});
