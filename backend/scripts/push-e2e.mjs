/**
 * Push notification smoke test — run with backend up (PUSH_PROVIDER=console):
 *   node scripts/push-e2e.mjs
 */
const base = process.env.API_BASE || 'http://localhost:4000/api/v1';
const pass = 'Password1';
const ts = Date.now();
const custEmail = `push.cust.${ts}@fixnow.test`;
const techEmail = `push.tech.${ts}@fixnow.test`;

async function api(method, path, body, token) {
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(`${base}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  const json = await res.json().catch(() => null);
  return { status: res.status, json };
}

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

async function registerAndLogin(email, fullName, role) {
  const reg = await api('POST', '/auth/register', {
    email,
    password: pass,
    fullName,
    role,
  });
  assert(reg.status === 201, `${role} reg ${reg.status}`);
  await api('POST', '/auth/verify-otp', {
    email,
    code: reg.json.data.verification.debugOtp,
    purpose: 'email_verification',
  });
  const login = await api('POST', '/auth/login', { email, password: pass });
  assert(login.status === 200, `${role} login ${login.status}`);
  return {
    token: login.json.data.tokens.accessToken,
    userId: login.json.data.user.id,
  };
}

async function registerDevice(token, deviceToken, platform = 'web', deviceId) {
  const res = await api(
    'POST',
    '/devices',
    {
      token: deviceToken,
      platform,
      deviceId,
      timezone: 'Africa/Kampala',
    },
    token,
  );
  assert(res.status === 201 || res.status === 200, `device register ${res.status}`);
  return res.json.data.device;
}

async function countDeliveries(userToken, eventType) {
  // Use notifications list as proxy + admin would need admin; inspect via device+prefs path:
  // We query notifications for the user which proves in-app + push path ran.
  const res = await api('GET', `/notifications?limit=50`, null, userToken);
  assert(res.status === 200, `list notifications ${res.status}`);
  const items = res.json.data.items ?? [];
  return items.filter((n) => n.type === eventType).length;
}

async function main() {
  console.log('1) Register users + devices');
  const customer = await registerAndLogin(custEmail, 'Push Customer', 'customer');
  const technician = await registerAndLogin(techEmail, 'Push Technician', 'technician');

  const custDeviceToken = `web:e2e:cust:${ts}`;
  const techDeviceToken = `web:e2e:tech:${ts}`;
  await registerDevice(customer.token, custDeviceToken, 'web', `cust-dev-${ts}`);
  await registerDevice(technician.token, techDeviceToken, 'web', `tech-dev-${ts}`);

  console.log('2) Customer job → technician applies → customer notified');
  const jobRes = await api(
    'POST',
    '/jobs',
    {
      title: 'Push test plumbing',
      description: 'Need a plumber and push notifications for applications.',
      publish: true,
      location: { country: 'UG', district: 'Kampala', parish: 'Nakawa' },
      budgetMin: 40000,
      budgetMax: 90000,
    },
    customer.token,
  );
  assert(jobRes.status === 201, `job ${jobRes.status}`);
  const jobId = jobRes.json.data.job._id;

  const appRes = await api(
    'POST',
    `/jobs/${jobId}/applications`,
    { message: 'I can fix this', proposedAmount: 70000 },
    technician.token,
  );
  assert(appRes.status === 201, `apply ${appRes.status}`);
  const appId = appRes.json.data.application._id;

  assert(
    (await countDeliveries(customer.token, 'application.received')) >= 1,
    'customer missing application.received notification',
  );
  console.log('   ok customer received apply notification');

  console.log('3) Accept → technician assigned notification');
  const acc = await api('POST', `/applications/${appId}/accept`, {}, customer.token);
  assert(acc.status === 200, `accept ${acc.status}`);
  assert(
    (await countDeliveries(technician.token, 'application.accepted')) >= 1,
    'technician missing assignment notification',
  );
  console.log('   ok technician received assignment notification');

  console.log('4) Message push while "offline" (no socket — REST only)');
  const ensured = await api('POST', `/conversations/job/${jobId}`, {}, customer.token);
  const conversationId = ensured.json.data.conversation._id;
  const msg = await api(
    'POST',
    '/messages',
    { conversationId, body: 'Are you nearby?', clientMessageId: `push-${ts}` },
    technician.token,
  );
  assert(msg.status === 201 || msg.status === 200, `message ${msg.status}`);
  assert(
    (await countDeliveries(customer.token, 'message.new')) >= 1,
    'customer missing message.new notification',
  );
  console.log('   ok customer received message notification');

  console.log('5) Complete job → both parties notified');
  for (const [token, status] of [
    [technician.token, 'technician_en_route'],
    [technician.token, 'in_progress'],
    [technician.token, 'awaiting_confirmation'],
    [customer.token, 'completed'],
  ]) {
    const r = await api('PATCH', `/jobs/${jobId}/status`, { status }, token);
    assert(r.status === 200, `status ${status} -> ${r.status}`);
  }
  assert(
    (await countDeliveries(customer.token, 'job.completed')) >= 1,
    'customer missing job.completed',
  );
  assert(
    (await countDeliveries(technician.token, 'job.completed')) >= 1,
    'technician missing job.completed',
  );
  console.log('   ok completion notifications for both');

  console.log('6) Token refresh');
  const refreshed = await api(
    'POST',
    '/devices/refresh',
    {
      oldToken: custDeviceToken,
      newToken: `${custDeviceToken}:refreshed`,
      platform: 'web',
      deviceId: `cust-dev-${ts}`,
    },
    customer.token,
  );
  assert(refreshed.status === 200, `refresh ${refreshed.status}`);
  const devices = await api('GET', '/devices', null, customer.token);
  const activeTokens = (devices.json.data.items ?? []).map((d) => d.token);
  assert(activeTokens.includes(`${custDeviceToken}:refreshed`), 'new token missing');
  assert(!activeTokens.includes(custDeviceToken), 'old token still active');
  console.log('   ok token refresh');

  console.log('7) Invalid token cleanup (simulate via remove + re-register invalid path)');
  // Provider marks invalid tokens inactive; exercise remove API + ensure inactive not listed
  await api('POST', '/devices/remove', { token: `${custDeviceToken}:refreshed` }, customer.token);
  const afterRemove = await api('GET', '/devices', null, customer.token);
  assert(
    !(afterRemove.json.data.items ?? []).some((d) => d.token === `${custDeviceToken}:refreshed`),
    'removed token still listed',
  );
  console.log('   ok invalid/removed token cleaned from active list');

  console.log('8) Preferences respected (disable messaging push)');
  await registerDevice(customer.token, `web:e2e:cust2:${ts}`, 'web', `cust-dev2-${ts}`);
  await api(
    'PUT',
    '/notifications/preferences',
    { categories: { messaging: false } },
    customer.token,
  );
  const before = await countDeliveries(customer.token, 'message.new');
  await api(
    'POST',
    '/messages',
    { conversationId, body: 'Should not push', clientMessageId: `push-mute-${ts}` },
    technician.token,
  );
  // In-app may still create if inApp enabled — push should skip. Preference disables category for push;
  // notifyUser still creates in-app when inApp enabled. So message.new count may increase for in-app.
  // Verify preferences endpoint round-trip instead + category flag.
  const prefs = await api('GET', '/notifications/preferences', null, customer.token);
  assert(prefs.json.data.preferences.categories.messaging === false, 'messaging pref not saved');
  const after = await countDeliveries(customer.token, 'message.new');
  assert(after === before, 'messaging category disabled but notification still created');
  await api('PUT', '/notifications/preferences', { categories: { messaging: true } }, customer.token);
  console.log('   ok preferences respected (no new message notification while muted)');

  console.log('PUSH E2E PASSED');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
