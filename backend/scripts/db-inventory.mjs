/**
 * Read-only database inventory. Lists every collection and its document count
 * so we can tell "no data" apart from "data exists but the API hides it".
 */
import mongoose from 'mongoose';

const uri = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/FixNow';

await mongoose.connect(uri);
const db = mongoose.connection.db;
const collections = await db.listCollections().toArray();
const rows = [];
for (const c of collections.sort((a, b) => a.name.localeCompare(b.name))) {
  const count = await db.collection(c.name).countDocuments();
  rows.push({ collection: c.name, count });
}
console.log(`URI: ${uri}`);
console.log(`Collections: ${rows.length}`);
for (const r of rows) console.log(`${String(r.count).padStart(6)}  ${r.collection}`);
await mongoose.disconnect();
