/**
 * Marketplace E2E helper — run: node scripts/marketplace-e2e.mjs
 */
const base = process.env.API_BASE || 'http://localhost:4000/api/v1';
const ts = Date.now();
const pass = 'Password1';
const custEmail = `cust.${ts}@fixnow.test`;
const techEmail = `tech.${ts}@fixnow.test`;
const adminEmail = `admin.${ts}@fixnow.test`;

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

async function main() {
  console.log('1) Customer register/login');
  const regC = await api('POST', '/auth/register', {
    email: custEmail,
    password: pass,
    fullName: 'Cust User',
    role: 'customer',
  });
  assert(regC.status === 201, `cust register ${regC.status}`);
  await api('POST', '/auth/verify-otp', {
    email: custEmail,
    code: regC.json.data.verification.debugOtp,
    purpose: 'email_verification',
  });
  const loginC = await api('POST', '/auth/login', { email: custEmail, password: pass });
  const cToken = loginC.json.data.tokens.accessToken;

  console.log('2) Technician register/login');
  const regT = await api('POST', '/auth/register', {
    email: techEmail,
    password: pass,
    fullName: 'Tech User',
    role: 'technician',
  });
  assert(regT.status === 201, `tech register ${regT.status}`);
  await api('POST', '/auth/verify-otp', {
    email: techEmail,
    code: regT.json.data.verification.debugOtp,
    purpose: 'email_verification',
  });
  const loginT = await api('POST', '/auth/login', { email: techEmail, password: pass });
  const tToken = loginT.json.data.tokens.accessToken;

  console.log('3) Create+publish job');
  const jobRes = await api(
    'POST',
    '/jobs',
    {
      title: 'Fix leaking sink',
      description: 'Kitchen sink pipe is leaking badly and needs urgent repair work.',
      publish: true,
      location: { country: 'UG', district: 'Kampala', parish: 'Nakawa' },
      budgetMin: 50000,
      budgetMax: 120000,
    },
    cToken,
  );
  assert(jobRes.status === 201, `job create ${jobRes.status} ${JSON.stringify(jobRes.json)}`);
  assert(jobRes.json.data.job.status === 'posted', 'job should be posted');
  const jobId = jobRes.json.data.job._id;

  console.log('4) Discover nearby');
  const near = await api('GET', '/jobs/nearby?district=Kampala', null, tToken);
  assert(near.status === 200, `nearby ${near.status}`);

  console.log('5) Apply');
  const appRes = await api(
    'POST',
    `/jobs/${jobId}/applications`,
    { message: 'I can fix this today', proposedAmount: 80000 },
    tToken,
  );
  assert(appRes.status === 201, `apply ${appRes.status} ${JSON.stringify(appRes.json)}`);
  const appId = appRes.json.data.application._id;

  console.log('6) Compare applications');
  const apps = await api('GET', `/jobs/${jobId}/applications`, null, cToken);
  assert(apps.status === 200 && apps.json.data.comparison.length >= 1, 'comparison missing');

  console.log('7) Accept / assign');
  const acc = await api('POST', `/applications/${appId}/accept`, {}, cToken);
  assert(acc.status === 200 && acc.json.data.job.status === 'assigned', `accept ${acc.status}`);

  console.log('8) Progress statuses');
  for (const [token, status] of [
    [tToken, 'technician_en_route'],
    [tToken, 'in_progress'],
    [tToken, 'awaiting_confirmation'],
    [cToken, 'completed'],
  ]) {
    const r = await api('PATCH', `/jobs/${jobId}/status`, { status }, token);
    assert(r.status === 200, `status ${status} -> ${r.status} ${JSON.stringify(r.json)}`);
  }

  console.log('9) Trust + free jobs after completion');
  const tp = await api('GET', '/technicians/me/profile', null, tToken);
  assert(tp.json.data.profile.freeJobs.used >= 1, 'freeJobsUsed not incremented');
  assert(tp.json.data.profile.trustScore > 0, 'trust not updated');
  const techUserId = tp.json.data.user.id;
  console.log({
    trust: tp.json.data.profile.trustScore,
    used: tp.json.data.profile.freeJobs.used,
    remaining: tp.json.data.profile.freeJobs.remaining,
  });

  console.log('10) Seed admin + lock via override remaining=0');
  const mongoose = (await import('mongoose')).default;
  const bcrypt = (await import('bcryptjs')).default;
  await mongoose.connect('mongodb://127.0.0.1:27017/FixNow');
  const hash = await bcrypt.hash(pass, 12);
  await mongoose.connection.db.collection('users').updateOne(
    { email: adminEmail },
    {
      $set: {
        email: adminEmail,
        passwordHash: hash,
        role: 'admin',
        fullName: 'Admin',
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
    },
    { upsert: true },
  );
  await mongoose.disconnect();

  const adminLogin = await api('POST', '/auth/login', { email: adminEmail, password: pass });
  assert(adminLogin.status === 200, `admin login ${adminLogin.status}`);
  const aToken = adminLogin.json.data.tokens.accessToken;

  const lock = await api(
    'POST',
    `/admin/technicians/${techUserId}/free-jobs`,
    { freeJobLimit: 20, remainingFreeJobs: 0, unlock: false },
    aToken,
  );
  assert(lock.status === 200 && lock.json.data.freeJobs.locked === true, 'lock via admin override failed');

  const job2 = await api(
    'POST',
    '/jobs',
    {
      title: 'Install ceiling fan',
      description: 'Need ceiling fan installed in living room with wiring check included.',
      publish: true,
      location: { country: 'UG', district: 'Kampala' },
    },
    cToken,
  );
  const job2Id = job2.json.data.job._id;
  const deny = await api(
    'POST',
    `/jobs/${job2Id}/applications`,
    { message: 'should fail', proposedAmount: 90000 },
    tToken,
  );
  assert(deny.status === 403, `expected 403 when locked, got ${deny.status}`);
  console.log('locked apply blocked OK');

  console.log('11) Admin unlock override');
  const unlock = await api(
    'POST',
    `/admin/technicians/${techUserId}/free-jobs`,
    { freeJobLimit: 20, remainingFreeJobs: 5, unlock: true },
    aToken,
  );
  assert(unlock.status === 200 && unlock.json.data.freeJobs.locked === false, 'unlock failed');

  const allow = await api(
    'POST',
    `/jobs/${job2Id}/applications`,
    { message: 'unlocked apply', proposedAmount: 95000 },
    tToken,
  );
  assert(allow.status === 201, `apply after unlock ${allow.status}`);

  console.log('12) Admin dashboard');
  const dash = await api('GET', '/admin/dashboard', null, aToken);
  assert(dash.status === 200 && dash.json.data.jobs.total >= 2, 'dashboard failed');

  console.log('MARKETPLACE E2E PASSED');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
