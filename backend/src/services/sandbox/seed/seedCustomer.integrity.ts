/**
 * Permanent Seed Customer integrity — migrate existing customer in place.
 * Never creates a duplicate. Never changes passwordHash.
 */

import { CustomerProfile, User } from '../../../models/index.js'
import { ACCOUNT_STATUS } from '../../../models/shared/enums.js'
import { ROLES } from '../../../constants/roles.js'
import { DEV_ADMIN } from '../../../constants/adminIdentity.js'
import { DEVELOPER_CUSTOMER, SEED_TAG } from './constants.js'

export async function ensureDeveloperCustomerIntegrity(): Promise<{
  status: 'ok' | 'repaired' | 'missing' | 'conflict'
  userId?: string
  message: string
  changes: string[]
}> {
  const email = DEVELOPER_CUSTOMER.email.toLowerCase()
  if (email === DEV_ADMIN.email.toLowerCase()) {
    return {
      status: 'conflict',
      message: 'Seed Customer email collides with Development Administrator — refused',
      changes: [],
    }
  }

  const user = await User.findOne({ email })
  if (!user) {
    return {
      status: 'missing',
      message:
        `Permanent Seed Customer ${DEVELOPER_CUSTOMER.email} not found. Sign in once with that account, then run Provision.`,
      changes: [],
    }
  }

  if (user.role === ROLES.ADMIN) {
    return {
      status: 'conflict',
      userId: user._id.toString(),
      message: 'This email is an administrator account and was not migrated to Seed Customer.',
      changes: [],
    }
  }

  const changes: string[] = []
  const meta = { ...((user.metadata as Record<string, unknown>) || {}) }

  // Prefer keeping customer role; if somehow technician, convert only when not admin.
  if (user.role !== ROLES.CUSTOMER) {
    user.role = ROLES.CUSTOMER
    changes.push('role→customer')
  }
  if (user.isDeleted || user.accountStatus === ACCOUNT_STATUS.SUSPENDED || user.accountStatus === ACCOUNT_STATUS.LOCKED) {
    user.isDeleted = false
    user.deletedAt = undefined
    user.accountStatus = ACCOUNT_STATUS.ACTIVE
    changes.push('reactivated')
  }
  if (user.failedLoginAttempts) {
    user.failedLoginAttempts = 0
    changes.push('clearedFailedLogins')
  }
  if (user.lockUntil) {
    user.lockUntil = undefined
    changes.push('clearedLock')
  }
  if ((user as { dataEnvironment?: string }).dataEnvironment !== 'sandbox') {
    ;(user as { dataEnvironment?: string }).dataEnvironment = 'sandbox'
    changes.push('dataEnvironment→sandbox')
  }
  if (meta.seedTag !== SEED_TAG) {
    meta.seedTag = SEED_TAG
    changes.push('seedTag')
  }
  if (meta.seedKey !== DEVELOPER_CUSTOMER.seedKey) {
    meta.seedKey = DEVELOPER_CUSTOMER.seedKey
    changes.push('seedKey')
  }
  if (meta.developer !== true) {
    meta.developer = true
    changes.push('metadata.developer')
  }
  if (meta.seed !== true) {
    meta.seed = true
    changes.push('metadata.seed')
  }
  if (meta.sandbox !== true) {
    meta.sandbox = true
    changes.push('metadata.sandbox')
  }
  if (meta.permanentDevelopmentCustomer !== true) {
    meta.permanentDevelopmentCustomer = true
    changes.push('metadata.permanentDevelopmentCustomer')
  }
  if (meta.developmentTestingEnabled !== true) {
    meta.developmentTestingEnabled = true
    changes.push('metadata.developmentTestingEnabled')
  }
  if (meta.scenarioPermissions !== true) {
    meta.scenarioPermissions = true
    changes.push('metadata.scenarioPermissions')
  }
  if (meta.environment !== 'sandbox') {
    meta.environment = 'sandbox'
    changes.push('metadata.environment')
  }
  if (meta.governanceRole !== 'permanent_development_customer') {
    meta.governanceRole = 'permanent_development_customer'
    changes.push('metadata.governanceRole')
  }
  if (meta.platformRole !== 'development_customer') {
    meta.platformRole = 'development_customer'
    changes.push('metadata.platformRole')
  }
  // Never touch passwordHash — registration credentials stay authoritative.
  user.metadata = meta
  if (!user.emailVerifiedAt) {
    user.emailVerifiedAt = new Date()
    changes.push('emailVerified')
  }

  if (changes.length) {
    await user.save()
  }

  const profile = await CustomerProfile.findOne({ userId: user._id })
  if (profile) {
    const profileChanges: string[] = []
    if (profile.isDeleted) {
      profile.isDeleted = false
      profile.deletedAt = undefined
      profileChanges.push('profileReactivated')
    }
    if ((profile as { dataEnvironment?: string }).dataEnvironment !== 'sandbox') {
      ;(profile as { dataEnvironment?: string }).dataEnvironment = 'sandbox'
      profileChanges.push('profileSandbox')
    }
    profile.metadata = {
      ...((profile.metadata as Record<string, unknown>) || {}),
      seedTag: SEED_TAG,
      seedKey: DEVELOPER_CUSTOMER.seedKey,
      developer: true,
      seed: true,
      sandbox: true,
      permanentDevelopmentCustomer: true,
      developmentTestingEnabled: true,
      scenarioPermissions: true,
      environment: 'sandbox',
      governanceRole: 'permanent_development_customer',
      platformRole: 'development_customer',
    }
    if (!profile.bio && DEVELOPER_CUSTOMER.bio) {
      profile.bio = DEVELOPER_CUSTOMER.bio
      profileChanges.push('bioHint')
    }
    await profile.save()
    if (profileChanges.length) changes.push(...profileChanges)
    else if (changes.length) changes.push('profileMetadataSynced')
  } else {
    await CustomerProfile.create({
      userId: user._id,
      bio: DEVELOPER_CUSTOMER.bio,
      languages: ['en'],
      location: {
        country: 'UG',
        district: DEVELOPER_CUSTOMER.district,
        city: DEVELOPER_CUSTOMER.city,
        landmark: DEVELOPER_CUSTOMER.landmark,
        geo: { type: 'Point', coordinates: [DEVELOPER_CUSTOMER.lng, DEVELOPER_CUSTOMER.lat] },
      },
      dataEnvironment: 'sandbox',
      metadata: {
        seedTag: SEED_TAG,
        seedKey: DEVELOPER_CUSTOMER.seedKey,
        developer: true,
        seed: true,
        sandbox: true,
        permanentDevelopmentCustomer: true,
        developmentTestingEnabled: true,
        scenarioPermissions: true,
        environment: 'sandbox',
        governanceRole: 'permanent_development_customer',
        platformRole: 'development_customer',
      },
      jobStats: { posted: 0, completed: 0, cancelled: 0 },
    })
    changes.push('customerProfileCreated')
  }

  return {
    status: changes.length ? 'repaired' : 'ok',
    userId: user._id.toString(),
    message: changes.length
      ? `Permanent Seed Customer migrated: ${changes.join(', ')} (password preserved)`
      : 'Permanent Seed Customer integrity OK (password and identity preserved)',
    changes,
  }
}
