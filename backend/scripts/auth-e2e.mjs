/**
 * Authentication e2e — register, verify, login, refresh, role denial, bad password.
 * Requires API + Mongo. Uses shared helpers for mock consistency.
 *
 *   node scripts/auth-e2e.mjs
 */

import {
  api,
  assert,
  assertOk,
  DEFAULT_PASSWORD,
  registerAndLogin,
  uniqueEmail,
} from './_helpers/index.mjs';

async function main() {
  const custEmail = uniqueEmail('auth.cust');
  const techEmail = uniqueEmail('auth.tech');

  console.log('1) Customer register → OTP → login');
  const customer = await registerAndLogin({
    email: custEmail,
    fullName: 'Auth Customer',
    role: 'customer',
  });
  assert(customer.token, 'customer access token missing');
  assert(customer.refreshToken, 'customer refresh token missing');

  console.log('2) Technician register → login');
  const technician = await registerAndLogin({
    email: techEmail,
    fullName: 'Auth Technician',
    role: 'technician',
  });
  assert(technician.token, 'tech access token missing');

  console.log('3) Refresh access token');
  const refresh = await api('POST', '/auth/refresh', {
    refreshToken: customer.refreshToken,
  });
  assertOk(refresh, 'refresh');
  assert(refresh.json?.data?.tokens?.accessToken, 'refresh did not return accessToken');

  console.log('4) Wrong password rejected');
  const bad = await api('POST', '/auth/login', {
    email: custEmail,
    password: 'WrongPassword1',
  });
  assert(bad.status === 401 || bad.status === 400, `expected auth failure, got ${bad.status}`);

  console.log('5) Customer cannot hit admin-only surface');
  const adminProbe = await api('GET', '/admin/dashboard', null, customer.token);
  assert(
    adminProbe.status === 401 || adminProbe.status === 403,
    `customer admin probe should be denied, got ${adminProbe.status}`,
  );

  console.log('6) Me / session profile');
  const me = await api('GET', '/auth/me', null, customer.token);
  if (me.status === 404) {
    // Some builds expose /users/me instead — try common alternate.
    const alt = await api('GET', '/users/me', null, customer.token);
    assert(alt.status === 200 || me.status === 200, `me endpoint unavailable (${me.status}/${alt.status})`);
  } else {
    assertOk(me, 'auth/me');
  }

  console.log('7) Technician token usable for technician-scoped list');
  const nearby = await api('GET', '/jobs/nearby?district=Kampala', null, technician.token);
  assert(nearby.status === 200 || nearby.status === 400, `nearby unexpected ${nearby.status}`);

  console.log('Auth e2e passed');
}

main().catch((err) => {
  console.error('Auth e2e FAILED', err);
  process.exit(1);
});
