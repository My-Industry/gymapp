// Run with: npm test
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { parseUsers, verifyPassword, readConfig, checkLogin } from '../api/_lib/auth.js';
import { validateNewUser, addUserToEnvText, isLocalRequest } from '../api/_lib/signup.js';
import signup from '../api/signup.js';

function mockRes() {
  const res = { headers: {}, statusCode: 200, body: undefined };
  res.setHeader = (k, v) => { res.headers[k.toLowerCase()] = v; };
  res.status = (c) => { res.statusCode = c; return res; };
  res.json = (b) => { res.body = b; return res; };
  return res;
}
const local = { remoteAddress: '127.0.0.1' };
const remote = { remoteAddress: '203.0.113.9' };

test('username and password rules', () => {
  assert.equal(validateNewUser('Owner', 'longenough'), '');
  assert.equal(validateNewUser('front.desk-1', 'longenough'), '');
  assert.match(validateNewUser('ab', 'longenough'), /Username/);
  assert.match(validateNewUser('has space', 'longenough'), /Username/);
  assert.match(validateNewUser('a:b,c', 'longenough'), /Username/); // would break AUTH_USERS
  assert.match(validateNewUser('owner', 'short'), /at least 8/);
  assert.match(validateNewUser('owner', undefined), /at least 8/);
  assert.match(validateNewUser('owner', 'x'.repeat(201)), /too long/);
});

test('addUserToEnvText creates, appends, keeps other lines, and adds a secret', () => {
  const first = addUserToEnvText('', 'owner', 'scrypt.a.b', () => 's'.repeat(40));
  assert.equal(first.text, `AUTH_USERS=owner:scrypt.a.b\nAUTH_SECRET=${'s'.repeat(40)}\n`);

  const second = addUserToEnvText(`OTHER=1\n${first.text}`, 'desk', 'scrypt.c.d', () => 'never used'.repeat(5));
  assert.equal(second.users, 'owner:scrypt.a.b,desk:scrypt.c.d');
  assert.match(second.text, /^OTHER=1$/m);
  assert.match(second.text, new RegExp(`^AUTH_SECRET=${'s'.repeat(40)}$`, 'm')); // secret kept
  assert.deepEqual([...parseUsers(second.users).keys()], ['owner', 'desk']);

  assert.deepEqual(addUserToEnvText(first.text, 'owner', 'scrypt.x.y'), { duplicate: true });
});

test('quoted values and Windows line endings in .env.local are handled', () => {
  const r = addUserToEnvText(`AUTH_USERS="owner:scrypt.a.b"\r\nAUTH_SECRET=${'k'.repeat(40)}\r\n`, 'desk', 'scrypt.c.d');
  assert.equal(r.users, 'owner:scrypt.a.b,desk:scrypt.c.d');
  assert.equal(r.secret, 'k'.repeat(40));
});

test('only loopback connections count as local', () => {
  assert.equal(isLocalRequest({ socket: local }), true);
  assert.equal(isLocalRequest({ socket: { remoteAddress: '::1' } }), true);
  assert.equal(isLocalRequest({ socket: remote }), false);
  assert.equal(isLocalRequest({}), false);
});

test('POST /api/signup saves to the env file locally, and the new login works', async () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'gym-signup-'));
  const file = path.join(dir, '.env.local');
  writeFileSync(file, 'KEEP=me\n');
  process.env.AUTH_ENV_FILE = file;
  delete process.env.AUTH_USERS;
  delete process.env.AUTH_SECRET;
  try {
    const res = mockRes();
    await signup({ method: 'POST', headers: {}, socket: local, body: { username: 'Owner', password: 'correct horse' } }, res);
    assert.equal(res.statusCode, 201);
    assert.equal(res.body.saved, true);
    assert.equal(res.body.user, 'owner');

    const saved = readFileSync(file, 'utf8');
    assert.match(saved, /^KEEP=me$/m);
    assert.ok(saved.includes(`AUTH_USERS=${res.body.entry}`));
    assert.ok(!saved.includes('correct horse')); // only the hash is stored

    // usable straight away, no restart
    const config = readConfig(process.env);
    assert.equal(config.ok, true);
    assert.equal(checkLogin(config, 'owner', 'correct horse'), 'owner');

    // second signup with the same name is refused; a different name appends
    const dup = mockRes();
    await signup({ method: 'POST', headers: {}, socket: local, body: { username: 'owner', password: 'another pass' } }, dup);
    assert.equal(dup.statusCode, 409);
    const next = mockRes();
    await signup({ method: 'POST', headers: {}, socket: local, body: { username: 'desk', password: 'front-desk-pw' } }, next);
    assert.equal(next.statusCode, 201);
    assert.deepEqual([...parseUsers(process.env.AUTH_USERS).keys()], ['owner', 'desk']);
  } finally {
    delete process.env.AUTH_ENV_FILE;
    delete process.env.AUTH_USERS;
    delete process.env.AUTH_SECRET;
    rmSync(dir, { recursive: true, force: true });
  }
});

test('on the deployed site (or a non-local request) nothing is saved, the entry is returned', async () => {
  delete process.env.AUTH_ENV_FILE;
  const res = mockRes();
  await signup({ method: 'POST', headers: {}, socket: remote, body: { username: 'newstaff', password: 'staff-pass-1' } }, res);
  assert.equal(res.statusCode, 200);
  assert.equal(res.body.saved, false);
  const [name, hash] = res.body.entry.split(':');
  assert.equal(name, 'newstaff');
  assert.equal(verifyPassword('staff-pass-1', hash), true);

  // a remote request is refused a file write even if AUTH_ENV_FILE is set
  process.env.AUTH_ENV_FILE = path.join(tmpdir(), 'should-not-be-written.env');
  const remoteRes = mockRes();
  await signup({ method: 'POST', headers: {}, socket: remote, body: { username: 'newstaff', password: 'staff-pass-1' } }, remoteRes);
  delete process.env.AUTH_ENV_FILE;
  assert.equal(remoteRes.body.saved, false);
});

test('signup validates input, rejects taken names and other methods', async () => {
  process.env.AUTH_USERS = 'owner:scrypt.a.b';
  try {
    const bad = mockRes();
    await signup({ method: 'POST', headers: {}, socket: remote, body: { username: 'x', password: 'longenough' } }, bad);
    assert.equal(bad.statusCode, 400);

    const taken = mockRes();
    await signup({ method: 'POST', headers: {}, socket: remote, body: { username: 'OWNER', password: 'longenough' } }, taken);
    assert.equal(taken.statusCode, 409);

    const get = mockRes();
    await signup({ method: 'GET', headers: {} }, get);
    assert.equal(get.statusCode, 405);
  } finally {
    delete process.env.AUTH_USERS;
  }
});
