/**
 * Reviews & reputation smoke test — API must be running:
 *   node scripts/reviews-e2e.mjs
 */
const base = process.env.API_BASE || 'http://localhost:4000/api/v1';
const pass = 'Password1';
const ts = Date.now();
const custEmail = `rev.cust.${ts}@fixnow.test`;
const techEmail = `rev.tech.${ts}@fixnow.test`;
const adminEmail = `rev.admin.${ts}@fixnow.test`;

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
  assert(reg.status === 201, `${role} reg ${reg.status}`);
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
        fullName: 'Rev Admin',
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
  console.log('1) Register + complete job');
  const customer = await registerAndLogin(custEmail, 'Rev Customer', 'customer');
  const technician = await registerAndLogin(techEmail, 'Rev Technician', 'technician');

  const jobRes = await api(
    'POST',
    '/jobs',
    {
      title: 'Review system test job',
      description: 'Complete this job so both parties can leave reviews and ratings.',
      publish: true,
      location: { country: 'UG', district: 'Kampala', parish: 'Nakawa' },
      budgetMin: 50000,
      budgetMax: 100000,
    },
    customer.token,
  );
  assert(jobRes.status === 201, `job ${jobRes.status}`);
  const jobId = jobRes.json.data.job._id;

  const appRes = await api(
    'POST',
    `/jobs/${jobId}/applications`,
    { message: 'Happy to help', proposedAmount: 80000 },
    technician.token,
  );
  assert(appRes.status === 201, `apply ${appRes.status}`);
  const appId = appRes.json.data.application._id;
  assert((await api('POST', `/applications/${appId}/accept`, {}, customer.token)).status === 200, 'accept failed');

  for (const [token, status] of [
    [technician.token, 'technician_en_route'],
    [technician.token, 'in_progress'],
    [technician.token, 'awaiting_confirmation'],
    [customer.token, 'completed'],
  ]) {
    const r = await api('PATCH', `/jobs/${jobId}/status`, { status }, token);
    assert(r.status === 200, `status ${status} -> ${r.status}`);
  }

  console.log('2) Customer submits review');
  const custReview = await api(
    'POST',
    '/reviews',
    {
      jobId,
      rating: 5,
      comment: 'Excellent work',
      categories: {
        quality: 5,
        professionalism: 5,
        communication: 4,
        timeliness: 5,
        valueForMoney: 4,
      },
    },
    customer.token,
  );
  assert(custReview.status === 201, `customer review ${custReview.status} ${JSON.stringify(custReview.json)}`);
  const reviewId = custReview.json.data.review._id;

  console.log('3) Technician reciprocal review');
  const techReview = await api(
    'POST',
    '/reviews',
    {
      jobId,
      rating: 4,
      comment: 'Great customer',
      categories: { professionalism: 4, communication: 5, timeliness: 4 },
    },
    technician.token,
  );
  assert(techReview.status === 201, `tech review ${techReview.status} ${JSON.stringify(techReview.json)}`);

  console.log('4) Ratings update immediately');
  const list = await api('GET', `/technicians/${technician.userId}/reviews`, null, customer.token);
  assert(list.status === 200, `list ${list.status}`);
  assert(list.json.data.summary.reviewCount >= 1, 'review count missing');
  assert(list.json.data.summary.ratingAverage >= 4, 'average not updated');
  console.log('   ok summary', list.json.data.summary);

  console.log('5) Reputation recalculated');
  const rep = await api('GET', '/reputation/me?role=technician', null, technician.token);
  assert(rep.status === 200, `reputation ${rep.status}`);
  assert(rep.json.data.reputation.score >= 100, 'reputation score missing');
  assert(rep.json.data.ratings.total >= 1, 'reputation ratings missing');
  console.log('   ok reputation', {
    score: rep.json.data.reputation.score,
    level: rep.json.data.reputation.level,
    avg: rep.json.data.ratings.average,
  });

  console.log('6) Badge assignment');
  const badges = await api('GET', '/achievements/me', null, technician.token);
  assert(badges.status === 200, `achievements ${badges.status}`);
  const badgeKeys = (badges.json.data.badges ?? []).map((b) => b.key);
  assert(badgeKeys.includes('five_star') || badgeKeys.includes('first_job'), `badges=${badgeKeys}`);
  console.log('   ok badges', badgeKeys);

  console.log('7) Notifications delivered');
  const notifs = await api('GET', '/notifications?limit=20', null, technician.token);
  assert(notifs.status === 200, `notifications ${notifs.status}`);
  const types = (notifs.json.data.items ?? []).map((n) => n.type);
  assert(types.includes('review.received'), `missing review.received in ${types}`);
  console.log('   ok notification types include review.received');

  console.log('8) Admin moderation');
  const aToken = await seedAdmin();
  await api('POST', `/reviews/${reviewId}/flag`, { reason: 'test flag' }, customer.token);
  const flagged = await api('GET', '/admin/reviews?flagged=true', null, aToken);
  assert(flagged.status === 200, `flagged list ${flagged.status}`);
  assert((flagged.json.data.items ?? []).length >= 1, 'flagged empty');
  const mod = await api('POST', `/admin/reviews/${reviewId}/moderate`, { action: 'approve' }, aToken);
  assert(mod.status === 200, `moderate ${mod.status}`);
  const analytics = await api('GET', '/admin/reviews/analytics', null, aToken);
  assert(analytics.status === 200, `analytics ${analytics.status}`);
  console.log('   ok moderation + analytics', analytics.json.data);

  console.log('REVIEWS E2E PASSED');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
