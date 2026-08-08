/**
 * Realtime sync smoke test — run with backend up:
 *   node scripts/realtime-e2e.mjs
 */
import { io } from 'socket.io-client';

const base = process.env.API_BASE || 'http://localhost:4000/api/v1';
const socketUrl = process.env.SOCKET_URL || 'http://localhost:4000';
const pass = 'Password1';
const ts = Date.now();
const custEmail = `rt.cust.${ts}@fixnow.test`;
const techEmail = `rt.tech.${ts}@fixnow.test`;

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

function waitFor(socket, event, timeoutMs = 8000) {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(`timeout waiting for ${event}`)), timeoutMs);
    socket.once(event, (payload) => {
      clearTimeout(t);
      resolve(payload);
    });
  });
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

async function main() {
  console.log('1) Register + verify customer/technician');
  const regC = await api('POST', '/auth/register', {
    email: custEmail,
    password: pass,
    fullName: 'RT Customer',
    role: 'customer',
  });
  assert(regC.status === 201, `cust reg ${regC.status}`);
  await api('POST', '/auth/verify-otp', {
    email: custEmail,
    code: regC.json.data.verification.debugOtp,
    purpose: 'email_verification',
  });
  const loginC = await api('POST', '/auth/login', { email: custEmail, password: pass });
  const cToken = loginC.json.data.tokens.accessToken;

  const regT = await api('POST', '/auth/register', {
    email: techEmail,
    password: pass,
    fullName: 'RT Technician',
    role: 'technician',
  });
  assert(regT.status === 201, `tech reg ${regT.status}`);
  await api('POST', '/auth/verify-otp', {
    email: techEmail,
    code: regT.json.data.verification.debugOtp,
    purpose: 'email_verification',
  });
  const loginT = await api('POST', '/auth/login', { email: techEmail, password: pass });
  const tToken = loginT.json.data.tokens.accessToken;

  console.log('2) Connect sockets');
  const techSocket = await connect(tToken);
  const custSocket = await connect(cToken);

  console.log('3) Customer creates job → technician receives job:published');
  const publishedP = waitFor(techSocket, 'job:published');
  const jobRes = await api(
    'POST',
    '/jobs',
    {
      title: 'Realtime leak fix',
      description: 'Kitchen sink pipe is leaking and needs urgent repair today.',
      publish: true,
      location: { country: 'UG', district: 'Kampala', parish: 'Nakawa' },
      budgetMin: 40000,
      budgetMax: 90000,
    },
    cToken,
  );
  assert(jobRes.status === 201, `job create ${jobRes.status}`);
  const jobId = jobRes.json.data.job._id;
  const published = await publishedP;
  assert(published?.job?._id === jobId || published?.job?.id === jobId, 'job:published mismatch');
  console.log('   ok job:published');

  console.log('4) Join job room + technician applies → customer gets application:submitted');
  await new Promise((resolve) => {
    custSocket.emit('job:join', jobId, (ack) => {
      assert(ack?.ok, `job:join failed ${JSON.stringify(ack)}`);
      resolve();
    });
  });
  const appliedP = waitFor(custSocket, 'application:submitted');
  const appRes = await api(
    'POST',
    `/jobs/${jobId}/applications`,
    { message: 'I can fix this now', proposedAmount: 70000 },
    tToken,
  );
  assert(appRes.status === 201, `apply ${appRes.status}`);
  const appId = appRes.json.data.application._id;
  await appliedP;
  console.log('   ok application:submitted');

  console.log('5) Customer accepts → technician gets technician:assigned + job:assigned');
  const assignedP = waitFor(techSocket, 'technician:assigned');
  const jobAssignedP = waitFor(techSocket, 'job:assigned');
  const acceptedP = waitFor(custSocket, 'application:accepted');
  const acc = await api('POST', `/applications/${appId}/accept`, {}, cToken);
  assert(acc.status === 200, `accept ${acc.status}`);
  await assignedP;
  await jobAssignedP;
  await acceptedP;
  console.log('   ok technician:assigned / job:assigned / application:accepted');

  console.log('6) Status change → job:status_changed');
  const statusP = waitFor(techSocket, 'job:status_changed');
  const st = await api('PATCH', `/jobs/${jobId}/status`, { status: 'technician_en_route' }, tToken);
  assert(st.status === 200, `status ${st.status}`);
  await statusP;
  console.log('   ok job:status_changed');

  techSocket.close();
  custSocket.close();
  console.log('REALTIME E2E PASSED');
}

main().catch((err) => {
  console.error('REALTIME E2E FAILED', err);
  process.exit(1);
});
