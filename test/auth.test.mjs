// Run with: npm test
import test from 'node:test';
import assert from 'node:assert/strict';
import { hashPassword, verifyPassword, parseUsers, readConfig, checkLogin, createToken, verifyToken, parseCookies, COOKIE_NAME, SESSION_SECONDS, roleOf,} from '../api/_lib/auth.js';
import login from '../api/login.js';
import me from '../api/me.js';
import logout from '../api/logout.js';

const SECRET = 'x'.repeat(40);
const OWNER_HASH = hashPassword('correct horse');

function setEnv() {
  process.env.AUTH_SECRET = SECRET;
  process.env.AUTH_USERS = `Owner:${OWNER_HASH},desk:${hashPassword('front-desk-pw')}`;
}

function mockRes() {
  const res = { headers: {}, statusCode: 200, body: undefined };
  res.setHeader = (k, v) => { res.headers[k.toLowerCase()] = v; };
  res.status = (c) => { res.statusCode = c; return res; };
  res.json = (b) => { res.body = b; return res; };
  return res;
}

test('passwords hash, verify, and reject wrong ones', () => {
  const h = hashPassword('s3cret-pass');
  assert.match(h, /^scrypt\.[\w-]+\.[\w-]+$/);
  assert.ok(!h.includes('$')); // .env files expand "$"
  assert.notEqual(h, hashPassword('s3cret-pass')); // random salt
  assert.equal(verifyPassword('s3cret-pass', h), true);
  // hashes made before the format change ("$" separators) still verify
  assert.equal(verifyPassword('s3cret-pass', h.replaceAll('.', '$')), true);
  assert.equal(verifyPassword('s3cret-pasS', h), false);
  assert.equal(verifyPassword('', h), false);
  assert.equal(verifyPassword('s3cret-pass', 'garbage'), false);
  assert.equal(verifyPassword('s3cret-pass', undefined), false);
});

test('AUTH_USERS is parsed; usernames are case-insensitive', () => {
  const users = parseUsers(`Owner:${OWNER_HASH}, desk : abc ,broken,:nohash`);
  assert.deepEqual([...users.keys()], ['owner', 'desk']);
  assert.equal(users.get('owner'), OWNER_HASH);
});

test('config is not ok without a long secret or any users', () => {
  assert.equal(readConfig({}).ok, false);
  assert.equal(readConfig({ AUTH_SECRET: 'short', AUTH_USERS: `a:${OWNER_HASH}` }).ok, false);
  assert.equal(readConfig({ AUTH_SECRET: SECRET, AUTH_USERS: '' }).ok, false);
  assert.equal(readConfig({ AUTH_SECRET: SECRET, AUTH_USERS: `a:${OWNER_HASH}` }).ok, true);
});

test('checkLogin accepts the right password only', () => {
  const config = readConfig({ AUTH_SECRET: SECRET, AUTH_USERS: `owner:${OWNER_HASH}` });
  assert.equal(checkLogin(config, ' OWNER ', 'correct horse'), 'owner');
  assert.equal(checkLogin(config, 'owner', 'wrong'), null);
  assert.equal(checkLogin(config, 'nobody', 'correct horse'), null);
  assert.equal(checkLogin(config, undefined, undefined), null);
});

test('session tokens: valid, tampered, wrong secret, expired', () => {
  const now = Date.UTC(2026, 0, 1);
  const token = createToken('owner', SECRET, now);
  assert.equal(verifyToken(token, SECRET, now + 1000), 'owner');
  assert.equal(verifyToken(token, 'y'.repeat(40), now + 1000), null);

  const [payload, sig] = token.split('.');
  const forged = Buffer.from(JSON.stringify({ u: 'admin', exp: 9999999999 })).toString('base64url');
  assert.equal(verifyToken(`${forged}.${sig}`, SECRET, now), null);
  assert.equal(verifyToken(`${payload}.${sig.slice(0, -2)}AA`, SECRET, now), null);

  assert.equal(verifyToken(token, SECRET, now + (SESSION_SECONDS + 1) * 1000), null);
  assert.equal(verifyToken('', SECRET), null);
  assert.equal(verifyToken(undefined, SECRET), null);
  assert.equal(verifyToken('nodot', SECRET), null);
});

test('cookie header parsing', () => {
  assert.deepEqual(parseCookies('a=1; gym_session=abc.def; b=x=y'), { a: '1', gym_session: 'abc.def', b: 'x=y' });
  assert.deepEqual(parseCookies(undefined), {});
});

test('POST /api/login sets an httpOnly cookie that /api/me accepts', async () => {
  setEnv();
  const res = mockRes();
  await login({ method: 'POST', headers: { 'x-forwarded-proto': 'https' }, body: { username: 'owner', password: 'correct horse' } }, res);
  assert.equal(res.statusCode, 200);
  assert.deepEqual(res.body, { user: 'owner', role: 'admin' }); // first user is the admin
  const cookie = res.headers['set-cookie'];
  assert.match(cookie, new RegExp(`^${COOKIE_NAME}=`));
  for (const flag of ['HttpOnly', 'SameSite=Lax', 'Secure', 'Path=/']) assert.ok(cookie.includes(flag), flag);

  const meRes = mockRes();
  await me({ method: 'GET', headers: { cookie: cookie.split(';')[0] } }, meRes);
  assert.equal(meRes.statusCode, 200);
  assert.deepEqual(meRes.body, { user: 'owner', role: 'admin' });
});

test('roles: first user is admin unless AUTH_ADMINS names someone', () => {
  const base = { AUTH_SECRET: SECRET, AUTH_USERS: `owner:${OWNER_HASH},desk:${OWNER_HASH},mgr:${OWNER_HASH}` };
  const byDefault = readConfig(base);
  assert.equal(roleOf(byDefault, 'owner'), 'admin');
  assert.equal(roleOf(byDefault, 'desk'), 'staff');

  const named = readConfig({ ...base, AUTH_ADMINS: ' Mgr , ghost ' });
  assert.equal(roleOf(named, 'mgr'), 'admin');
  assert.equal(roleOf(named, 'owner'), 'staff');

  // naming only people who don't exist falls back to the first user
  assert.equal(roleOf(readConfig({ ...base, AUTH_ADMINS: 'ghost' }), 'owner'), 'admin');
});

test('a non-admin user gets the staff role at login', async () => {
  setEnv();
  const res = mockRes();
  await login({ method: 'POST', headers: {}, body: { username: 'desk', password: 'front-desk-pw' } }, res);
  assert.deepEqual(res.body, { user: 'desk', role: 'staff' });
});

test('login omits Secure over plain http (local dev)', async () => {
  setEnv();
  const res = mockRes();
  await login({ method: 'POST', headers: {}, body: { username: 'owner', password: 'correct horse' } }, res);
  assert.equal(res.statusCode, 200);
  assert.ok(!res.headers['set-cookie'].includes('Secure'));
});

test('wrong password gets 401 and no cookie', async () => {
  setEnv();
  const res = mockRes();
  await login({ method: 'POST', headers: {}, body: { username: 'owner', password: 'nope' } }, res);
  assert.equal(res.statusCode, 401);
  assert.equal(res.headers['set-cookie'], undefined);
  assert.match(res.body.error, /incorrect/i);
});

test('login accepts a JSON string body and rejects other methods', async () => {
  setEnv();
  const ok = mockRes();
  await login({ method: 'POST', headers: {}, body: JSON.stringify({ username: 'desk', password: 'front-desk-pw' }) }, ok);
  assert.equal(ok.statusCode, 200);

  const get = mockRes();
  await login({ method: 'GET', headers: {} }, get);
  assert.equal(get.statusCode, 405);
});

test('login reports a server error when env vars are missing', async () => {
  delete process.env.AUTH_SECRET;
  delete process.env.AUTH_USERS;
  const res = mockRes();
  await login({ method: 'POST', headers: {}, body: { username: 'owner', password: 'x' } }, res);
  assert.equal(res.statusCode, 500);
});

test('/api/me rejects missing, forged, and removed-user sessions', async () => {
  setEnv();
  const none = mockRes();
  await me({ method: 'GET', headers: {} }, none);
  assert.equal(none.statusCode, 401);

  const forged = mockRes();
  await me({ method: 'GET', headers: { cookie: `${COOKIE_NAME}=abc.def` } }, forged);
  assert.equal(forged.statusCode, 401);

  // valid signature, but the user was later removed from AUTH_USERS
  const token = createToken('desk', SECRET);
  process.env.AUTH_USERS = `owner:${OWNER_HASH}`;
  const removed = mockRes();
  await me({ method: 'GET', headers: { cookie: `${COOKIE_NAME}=${token}` } }, removed);
  assert.equal(removed.statusCode, 401);
});

test('POST /api/logout clears the cookie', () => {
  const res = mockRes();
  logout({ method: 'POST', headers: {} }, res);
  assert.equal(res.statusCode, 200);
  assert.match(res.headers['set-cookie'], /Max-Age=0/);
  const bad = mockRes();
  logout({ method: 'GET', headers: {} }, bad);
  assert.equal(bad.statusCode, 405);
});
