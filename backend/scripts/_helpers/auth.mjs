/**
 * Auth helpers for e2e — register → verify OTP → login.
 * Relies on debugOtp exposure in non-production / test env.
 */

import { api, assert, assertOk, DEFAULT_PASSWORD } from './http.mjs';

export async function registerAndLogin({
  email,
  fullName,
  role,
  password = DEFAULT_PASSWORD,
} = {}) {
  const reg = await api('POST', '/auth/register', {
    email,
    password,
    fullName,
    role,
  });
  assert(reg.status === 201, `${role} register ${reg.status} ${JSON.stringify(reg.json)}`);

  const debugOtp = reg.json?.data?.verification?.debugOtp;
  assert(debugOtp, `${role} missing debugOtp — set NODE_ENV/dev OTP exposure for e2e`);

  const verify = await api('POST', '/auth/verify-otp', {
    email,
    code: debugOtp,
    purpose: 'email_verification',
  });
  assertOk(verify, `${role} verify-otp`);

  const login = await api('POST', '/auth/login', { email, password });
  assert(login.status === 200, `${role} login ${login.status} ${JSON.stringify(login.json)}`);

  return {
    token: login.json.data.tokens.accessToken,
    refreshToken: login.json.data.tokens.refreshToken,
    userId: login.json.data.user.id,
    user: login.json.data.user,
    tokens: login.json.data.tokens,
  };
}

/**
 * Upsert an admin user directly in Mongo, then login.
 * Used when admin self-registration is disabled.
 */
export async function seedAdminAndLogin({
  email,
  fullName = 'E2E Admin',
  password = DEFAULT_PASSWORD,
} = {}) {
  const mongoose = (await import('mongoose')).default;
  const bcrypt = (await import('bcryptjs')).default;
  await mongoose.connect(process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/FixNow');
  const hash = await bcrypt.hash(password, 12);
  await mongoose.connection.db.collection('users').updateOne(
    { email },
    {
      $set: {
        email,
        passwordHash: hash,
        role: 'admin',
        fullName,
        accountStatus: 'active',
        emailVerifiedAt: new Date(),
        refreshTokenVersion: 0,
        failedLoginAttempts: 0,
        loyaltyPoints: 0,
        locale: 'en-UG',
        timezone: 'Africa/Kampala',
        isDeleted: false,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      $unset: { lockUntil: 1, deletedAt: 1 },
    },
    { upsert: true },
  );
  await mongoose.disconnect();

  const login = await api('POST', '/auth/login', { email, password });
  assert(login.status === 200, `admin login ${login.status} ${JSON.stringify(login.json)}`);
  return {
    token: login.json.data.tokens.accessToken,
    refreshToken: login.json.data.tokens.refreshToken,
    userId: login.json.data.user.id,
    user: login.json.data.user,
  };
}
