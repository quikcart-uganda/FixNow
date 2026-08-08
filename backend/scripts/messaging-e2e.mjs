/**
 * Messaging smoke test — run with backend up:
 *   node scripts/messaging-e2e.mjs
 *
 * Shared socket helpers: scripts/_helpers/socket.mjs
 */
import { io } from 'socket.io-client';

const base = process.env.API_BASE || 'http://localhost:4000/api/v1';
const socketUrl = process.env.SOCKET_URL || 'http://localhost:4000';
const pass = 'Password1';
const ts = Date.now();
const custEmail = `msg.cust.${ts}@fixnow.test`;
const techEmail = `msg.tech.${ts}@fixnow.test`;
const adminEmail = `msg.admin.${ts}@fixnow.test`;

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

function waitFor(socket, event, timeoutMs = 10000, predicate) {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => {
      socket.off(event, handler);
      reject(new Error(`timeout waiting for ${event}`));
    }, timeoutMs);
    function handler(payload) {
      if (predicate && !predicate(payload)) return;
      clearTimeout(t);
      socket.off(event, handler);
      resolve(payload);
    }
    socket.on(event, handler);
  });
}

function messageId(msg) {
  if (!msg) return '';
  const raw = msg._id ?? msg.id;
  return typeof raw === 'string' ? raw : String(raw);
}

function connect(token) {
  return new Promise((resolve, reject) => {
    const socket = io(socketUrl, {
      path: '/socket.io',
      auth: { token },
      transports: ['websocket'],
    });
    socket.on('connect_error', (err) => reject(err));
    socket.on('connect', () => resolve(socket));
  });
}

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

function joinConversation(socket, conversationId) {
  return new Promise((resolve, reject) => {
    socket.emit('conversation:join', conversationId, (ack) => {
      if (ack?.ok) resolve(ack);
      else reject(new Error(`conversation:join failed ${JSON.stringify(ack)}`));
    });
  });
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
  return login.json.data.tokens.accessToken;
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
        fullName: 'Msg Admin',
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
      $unset: { lockedUntil: 1, lockUntil: 1, deletedAt: 1 },
    },
    { upsert: true },
  );
  await mongoose.disconnect();
  const login = await api('POST', '/auth/login', { email: adminEmail, password: pass });
  assert(login.status === 200, `admin login ${login.status} ${JSON.stringify(login.json)}`);
  return login.json.data.tokens.accessToken;
}

async function main() {
  console.log('1) Register customer + technician');
  const cToken = await registerAndLogin(custEmail, 'Msg Customer', 'customer');
  const tToken = await registerAndLogin(techEmail, 'Msg Technician', 'technician');

  console.log('2) Create job → apply → accept (creates conversation)');
  const jobRes = await api(
    'POST',
    '/jobs',
    {
      title: 'Messaging pipe repair',
      description: 'Need a plumber for a kitchen leak and on-site chat coordination.',
      publish: true,
      location: { country: 'UG', district: 'Kampala', parish: 'Nakawa' },
      budgetMin: 40000,
      budgetMax: 90000,
    },
    cToken,
  );
  assert(jobRes.status === 201, `job create ${jobRes.status}`);
  const jobId = jobRes.json.data.job._id;

  const appRes = await api(
    'POST',
    `/jobs/${jobId}/applications`,
    { message: 'I can fix this and stay in chat', proposedAmount: 70000 },
    tToken,
  );
  assert(appRes.status === 201, `apply ${appRes.status}`);
  const appId = appRes.json.data.application._id;

  const acc = await api('POST', `/applications/${appId}/accept`, {}, cToken);
  assert(acc.status === 200, `accept ${acc.status}`);

  const ensured = await api('POST', `/conversations/job/${jobId}`, {}, cToken);
  assert(ensured.status === 200 || ensured.status === 201, `ensure ${ensured.status}`);
  const conversationId = ensured.json.data.conversation._id;
  assert(conversationId, 'missing conversation id');

  console.log('3) Connect sockets + join conversation room');
  const techSocket = await connect(tToken);
  const custSocket = await connect(cToken);
  await joinConversation(techSocket, conversationId);
  await joinConversation(custSocket, conversationId);

  console.log('4) Customer sends → technician receives instantly');
  const techNewP = waitFor(
    techSocket,
    'message:new',
    10000,
    (p) => messageId(p?.message) && p.message.body === 'Hi, the leak is under the sink.',
  );
  const sendC = await api(
    'POST',
    '/messages',
    {
      conversationId,
      body: 'Hi, the leak is under the sink.',
      clientMessageId: `c-${ts}-1`,
    },
    cToken,
  );
  assert(sendC.status === 201 || sendC.status === 200, `cust send ${sendC.status}`);
  const custMsgId = messageId(sendC.json.data.message);
  const techNew = await techNewP;
  assert(messageId(techNew?.message) === custMsgId, 'tech did not get customer message');
  console.log('   ok message:new (customer → technician)');

  console.log('5) Technician replies → customer receives instantly');
  const custNewP = waitFor(
    custSocket,
    'message:new',
    10000,
    (p) => messageId(p?.message) && p.message.body === 'On my way. Please keep a towel ready.',
  );
  const sendT = await api(
    'POST',
    '/messages',
    {
      conversationId,
      body: 'On my way. Please keep a towel ready.',
      clientMessageId: `t-${ts}-1`,
    },
    tToken,
  );
  assert(sendT.status === 201 || sendT.status === 200, `tech send ${sendT.status}`);
  const techMsgId = messageId(sendT.json.data.message);
  const custNew = await custNewP;
  assert(messageId(custNew?.message) === techMsgId, 'customer did not get tech reply');
  console.log('   ok message:new (technician → customer)');

  console.log('6) Delivered + read receipts');
  const deliveredP = waitFor(
    custSocket,
    'message:delivered',
    10000,
    (p) => String(p?.messageId) === custMsgId,
  );
  const del = await api('POST', `/messages/${custMsgId}/delivered`, {}, tToken);
  assert(del.status === 200, `delivered ${del.status}`);
  await deliveredP;
  console.log('   ok message:delivered');

  const readP = waitFor(custSocket, 'message:read');
  const read = await api('POST', `/conversations/${conversationId}/read`, {}, tToken);
  assert(read.status === 200, `read ${read.status}`);
  await readP;
  console.log('   ok message:read');

  console.log('7) Typing indicators');
  const typingP = waitFor(custSocket, 'typing:started');
  techSocket.emit('typing:start', { conversationId });
  await typingP;
  const typingStopP = waitFor(custSocket, 'typing:stopped');
  techSocket.emit('typing:stop', { conversationId });
  await typingStopP;
  console.log('   ok typing:started / typing:stopped');

  console.log('8) Admin read-only history');
  const aToken = await seedAdmin();
  const adminView = await api('GET', `/conversations/${conversationId}`, null, aToken);
  assert(adminView.status === 200, `admin get ${adminView.status}`);
  assert(adminView.json.data.canSend === false, 'admin should be read-only');
  assert((adminView.json.data.items ?? []).length >= 2, 'admin missing message history');
  const adminSend = await api(
    'POST',
    '/messages',
    { conversationId, body: 'admin should not send' },
    aToken,
  );
  assert(adminSend.status === 403 || adminSend.status === 401, `admin send should fail, got ${adminSend.status}`);
  console.log('   ok admin read-only');

  console.log('9) Complete job → conversation locked (read-only)');
  for (const [token, status] of [
    [tToken, 'technician_en_route'],
    [tToken, 'in_progress'],
    [tToken, 'awaiting_confirmation'],
    [cToken, 'completed'],
  ]) {
    const r = await api('PATCH', `/jobs/${jobId}/status`, { status }, token);
    assert(r.status === 200, `status ${status} -> ${r.status}`);
  }
  const lockedView = await api('GET', `/conversations/${conversationId}`, null, cToken);
  assert(lockedView.status === 200, `locked get ${lockedView.status}`);
  assert(lockedView.json.data.canSend === false, 'conversation should be read-only after complete');
  assert(lockedView.json.data.conversation.isLocked === true, 'isLocked should be true');
  const lockedSend = await api(
    'POST',
    '/messages',
    { conversationId, body: 'should fail after complete' },
    cToken,
  );
  assert(lockedSend.status === 403, `locked send should be 403, got ${lockedSend.status}`);
  console.log('   ok closed conversation is read-only');

  techSocket.close();
  custSocket.close();
  console.log('MESSAGING E2E PASSED');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
