/**
 * Payments & escrow E2E — API must be running:
 *   node scripts/payments-e2e.mjs
 *
 * Prefer shared helpers in scripts/_helpers for new suites (auth/http/socket/mocks).
 */
const base = process.env.API_BASE || 'http://localhost:4000/api/v1';
const pass = 'Password1';
const ts = Date.now();
const custEmail = `pay.cust.${ts}@fixnow.test`;
const techEmail = `pay.tech.${ts}@fixnow.test`;
const adminEmail = `pay.admin.${ts}@fixnow.test`;

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
  const reg = await api('POST', '/auth/register', { email, password: pass, fullName, role });
  assert(reg.status === 201, `${role} reg ${reg.status} ${JSON.stringify(reg.json)}`);
  await api('POST', '/auth/verify-otp', {
    email,
    code: reg.json.data.verification.debugOtp,
    purpose: 'email_verification',
  });
  const login = await api('POST', '/auth/login', { email, password: pass });
  assert(login.status === 200, `${role} login ${login.status}`);
  return { token: login.json.data.tokens.accessToken, userId: login.json.data.user.id };
}

async function seedAdmin() {
  const mongoose = (await import('mongoose')).default;
  const bcrypt = (await import('bcryptjs')).default;
  await mongoose.connect(process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/FixNow');
  const hash = await bcrypt.hash(pass, 12);
  await mongoose.connection.db.collection('users').updateOne(
    { email: adminEmail },
    {
      $set: {
        email: adminEmail,
        passwordHash: hash,
        role: 'admin',
        fullName: 'Pay Admin',
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
  const login = await api('POST', '/auth/login', { email: adminEmail, password: pass });
  assert(login.status === 200, `admin login ${login.status}`);
  return login.json.data.tokens.accessToken;
}

async function main() {
  console.log('1) Register customer + technician, seed admin');
  const customer = await registerAndLogin(custEmail, 'Pay Customer', 'customer');
  const technician = await registerAndLogin(techEmail, 'Pay Technician', 'technician');
  const adminToken = await seedAdmin();

  console.log('2) Create job → apply → assign');
  const jobRes = await api(
    'POST',
    '/jobs',
    {
      title: 'Payments escrow e2e job',
      description: 'End-to-end payment and escrow release verification for FixNow.',
      publish: true,
      location: { country: 'UG', district: 'Kampala', parish: 'Nakawa' },
      budgetMin: 75000,
      budgetMax: 75000,
    },
    customer.token,
  );
  assert(jobRes.status === 201, `job ${jobRes.status} ${JSON.stringify(jobRes.json)}`);
  const jobId = jobRes.json.data.job._id;

  const appRes = await api(
    'POST',
    `/jobs/${jobId}/applications`,
    { message: 'Ready to work', proposedAmount: 75000 },
    technician.token,
  );
  assert(appRes.status === 201, `apply ${appRes.status}`);
  const appId = appRes.json.data.application._id;
  assert((await api('POST', `/applications/${appId}/accept`, {}, customer.token)).status === 200, 'accept failed');

  console.log('3) Customer pays → escrow funded');
  const pay = await api(
    'POST',
    '/payments/pay',
    {
      jobId,
      provider: 'console',
      msisdn: '256700000001',
      idempotencyKey: `e2e-pay-${jobId}`,
    },
    customer.token,
  );
  assert(pay.status === 201, `pay ${pay.status} ${JSON.stringify(pay.json)}`);
  assert(pay.json.data.transaction.status === 'completed', 'payment not completed');
  assert(pay.json.data.escrow?.status === 'held', 'escrow not held');
  const escrowId = pay.json.data.escrow._id;

  const escrowGet = await api('GET', `/escrow/jobs/${jobId}`, null, customer.token);
  assert(escrowGet.status === 200, 'escrow get failed');
  assert(escrowGet.json.data.escrow.status === 'held', 'escrow status mismatch');

  console.log('4) Technician progresses → customer confirms completion → funds released');
  for (const [token, status] of [
    [technician.token, 'technician_en_route'],
    [technician.token, 'in_progress'],
    [technician.token, 'awaiting_confirmation'],
    [customer.token, 'completed'],
  ]) {
    const r = await api('PATCH', `/jobs/${jobId}/status`, { status }, token);
    assert(r.status === 200, `status ${status} -> ${r.status} ${JSON.stringify(r.json)}`);
  }

  const escrowAfter = await api('GET', `/escrow/jobs/${jobId}`, null, customer.token);
  assert(escrowAfter.json.data.escrow.status === 'released', `expected released got ${escrowAfter.json.data.escrow.status}`);

  console.log('5) Technician wallet updated');
  const earnings = await api('GET', '/payouts/earnings', null, technician.token);
  assert(earnings.status === 200, `earnings ${earnings.status}`);
  assert(Number(earnings.json.data.wallet.availableBalance) >= 75000, 'technician wallet not credited');

  await api(
    'POST',
    '/payments/methods',
    { provider: 'mtn', msisdn: '256700000099', accountName: 'Pay Technician', isDefault: true },
    technician.token,
  );
  const payoutReq = await api('POST', '/payouts/request', { amount: 25000 }, technician.token);
  assert(payoutReq.status === 201, `payout request ${payoutReq.status}`);
  const payoutId = payoutReq.json.data.transaction._id;
  const payoutApprove = await api('POST', `/admin/payouts/${payoutId}/approve`, {}, adminToken);
  assert(payoutApprove.status === 200, `payout approve ${payoutApprove.status}`);
  assert(payoutApprove.json.data.transaction.status === 'completed', 'payout not completed');

  console.log('6) Admin settlement visible');
  const dash = await api('GET', '/admin/payments/dashboard', null, adminToken);
  assert(dash.status === 200, 'payment dashboard failed');
  assert(Number(dash.json.data.dashboard.payments) >= 1, 'no payments in dashboard');

  const escDash = await api('GET', '/admin/escrow/dashboard', null, adminToken);
  assert(escDash.status === 200, 'escrow dashboard failed');

  const settle = await api('GET', '/admin/settlements?days=30', null, adminToken);
  assert(settle.status === 200, 'settlements failed');
  assert(Array.isArray(settle.json.data.report.byType), 'settlement byType missing');

  const receipt = await api(
    'GET',
    `/payments/transactions/${pay.json.data.transaction._id}/receipt`,
    null,
    customer.token,
  );
  assert(receipt.status === 200, 'receipt failed');
  assert(receipt.json.data.receipt.reference, 'receipt reference missing');

  console.log('7) Second job — refund request + admin approve');
  const job2 = await api(
    'POST',
    '/jobs',
    {
      title: 'Payments refund e2e job',
      description: 'End-to-end refund approval verification for FixNow escrow.',
      publish: true,
      location: { country: 'UG', district: 'Kampala', parish: 'Nakawa' },
      budgetMin: 40000,
      budgetMax: 40000,
    },
    customer.token,
  );
  assert(job2.status === 201, `job2 ${job2.status}`);
  const job2Id = job2.json.data.job._id;
  const app2 = await api(
    'POST',
    `/jobs/${job2Id}/applications`,
    { message: 'Refund path', proposedAmount: 40000 },
    technician.token,
  );
  assert(app2.status === 201, `apply2 ${app2.status}`);
  assert(
    (await api('POST', `/applications/${app2.json.data.application._id}/accept`, {}, customer.token)).status ===
      200,
    'accept2 failed',
  );
  const pay2 = await api(
    'POST',
    '/payments/pay',
    { jobId: job2Id, provider: 'console', idempotencyKey: `e2e-pay2-${job2Id}` },
    customer.token,
  );
  assert(pay2.status === 201 && pay2.json.data.escrow?.status === 'held', 'pay2 escrow not held');

  const refundReq = await api(
    'POST',
    '/escrow/refunds',
    { jobId: job2Id, reason: 'E2E partial quality issue', amount: 15000 },
    customer.token,
  );
  assert(refundReq.status === 200 || refundReq.status === 201, `refund req ${refundReq.status}`);
  const refundId = refundReq.json.data.transaction._id;
  assert(refundReq.json.data.transaction.status === 'pending', 'refund should be pending');

  const pendingRefunds = await api('GET', '/admin/refunds/pending', null, adminToken);
  assert(pendingRefunds.status === 200, 'pending refunds list failed');
  assert(
    (pendingRefunds.json.data.items ?? []).some((t) => String(t._id) === String(refundId)),
    'refund not in admin pending list',
  );

  const refundApprove = await api('POST', `/escrow/refunds/${refundId}/approve`, {}, adminToken);
  assert(refundApprove.status === 200, `refund approve ${refundApprove.status}`);
  assert(refundApprove.json.data.transaction.status === 'completed', 'refund not completed');
  assert(refundApprove.json.data.escrow.status === 'partially_released', 'expected partially_released');

  const searchPay = await api('GET', '/admin/payments?q=pay_&status=completed', null, adminToken);
  assert(searchPay.status === 200, 'admin payment search failed');

  console.log('PASS payments-escrow e2e', {
    jobId,
    escrowId,
    job2Id,
    refundId,
    techBalance: earnings.json.data.wallet.availableBalance,
  });
}

main().catch((err) => {
  console.error('FAIL', err);
  process.exit(1);
});
