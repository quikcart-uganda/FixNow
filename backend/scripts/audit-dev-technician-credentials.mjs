/**
 * Read-only audit: Development Technician runtime credential / lock state.
 * Does NOT change passwords. Optional --verify-documented compares only
 * passwords already documented in seed constants / reports.
 */
import mongoose from 'mongoose'
import bcrypt from 'bcryptjs'
import { config } from 'dotenv'

config()

const EMAIL = 'quikcart2026@gmail.com'
const DOCUMENTED = {
  developerTechnician: 'FixNowDev!2026',
  seedSharedUsers: 'SeedPlatform!2026',
}

const verifyDocumented = process.argv.includes('--verify-documented')
const clearTempLock = process.argv.includes('--clear-temp-lock')

const uri = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/FixNow'
await mongoose.connect(uri)
const db = mongoose.connection.db

const user = await db.collection('users').findOne(
  { email: EMAIL },
  {
    projection: {
      email: 1,
      role: 1,
      accountStatus: 1,
      isDeleted: 1,
      failedLoginAttempts: 1,
      lockUntil: 1,
      passwordChangedAt: 1,
      metadata: 1,
      dataEnvironment: 1,
      authProviders: 1,
      createdAt: 1,
      updatedAt: 1,
      fullName: 1,
      passwordHash: 1,
    },
  },
)

const profile = user
  ? await db.collection('technicianprofiles').findOne(
      { userId: user._id },
      {
        projection: {
          accountLocked: 1,
          lockReason: 1,
          dataEnvironment: 1,
          metadata: 1,
          subscriptionPlanCode: 1,
        },
      },
    )
  : null

if (!user) {
  console.log(JSON.stringify({ found: false, email: EMAIL }, null, 2))
  await mongoose.disconnect()
  process.exit(0)
}

const now = Date.now()
const lockActive = user.lockUntil ? new Date(user.lockUntil).getTime() > now : false
const hash = String(user.passwordHash || '')

const result = {
  found: true,
  id: String(user._id),
  email: user.email,
  fullName: user.fullName,
  role: user.role,
  accountStatus: user.accountStatus,
  isDeleted: Boolean(user.isDeleted),
  failedLoginAttempts: user.failedLoginAttempts ?? 0,
  lockUntil: user.lockUntil || null,
  lockActive,
  lockRemainingMs: lockActive ? new Date(user.lockUntil).getTime() - now : 0,
  hasPasswordHash: Boolean(hash),
  passwordHashAlgo: hash.startsWith('$2') ? 'bcrypt' : hash ? 'unknown' : 'missing',
  passwordHashPrefix: hash.slice(0, 7),
  passwordChangedAt: user.passwordChangedAt || null,
  metadata: user.metadata || null,
  dataEnvironment: user.dataEnvironment || null,
  authProviders: user.authProviders || null,
  createdAt: user.createdAt,
  updatedAt: user.updatedAt,
  technicianProfile: profile
    ? {
        accountLocked: Boolean(profile.accountLocked),
        lockReason: profile.lockReason || null,
        dataEnvironment: profile.dataEnvironment || null,
        metadata: profile.metadata || null,
        subscriptionPlanCode: profile.subscriptionPlanCode || null,
      }
    : null,
  documentedPasswords: DOCUMENTED,
  documentedPasswordMatches: null,
}

if (verifyDocumented && hash) {
  const matches = {}
  for (const [label, password] of Object.entries(DOCUMENTED)) {
    matches[label] = await bcrypt.compare(password, hash)
  }
  result.documentedPasswordMatches = matches
}

if (clearTempLock) {
  if (!lockActive && !(user.failedLoginAttempts > 0) && user.accountStatus !== 'locked') {
    result.lockClear = { performed: false, reason: 'No temporary auth lock to clear' }
  } else {
    await db.collection('users').updateOne(
      { _id: user._id },
      {
        $set: { failedLoginAttempts: 0, accountStatus: 'active' },
        $unset: { lockUntil: '' },
      },
    )
    result.lockClear = {
      performed: true,
      clearedFailedLoginAttempts: true,
      clearedLockUntil: true,
      restoredAccountStatus: 'active',
      note: 'Temporary auth lock only — password hash unchanged',
    }
  }
}

console.log(JSON.stringify(result, null, 2))
await mongoose.disconnect()
