// Terms and Conditions: sign-up must be refused unless they were accepted, and the text must be complete.
import test from 'node:test';
import assert from 'node:assert/strict';
import { TERMS, TERMS_UPDATED } from '../src/lib/terms.js';
import signup from '../api/signup.js';
import { setAccountStoreForTests } from '../api/_lib/accounts.js';

function mockRes() {
  const res = { headers: {}, statusCode: 200, body: undefined };
  res.setHeader = (k, v) => { res.headers[k.toLowerCase()] = v; };
  res.status = (c) => { res.statusCode = c; return res; };
  res.json = (b) => { res.body = b; return res; };
  return res;
}
const remote = { remoteAddress: '203.0.113.9' };
const attempt = async (body) => {
  const res = mockRes();
  await signup({ method: 'POST', headers: {}, socket: remote, body }, res);
  return res;
};

test('the terms have a date and every section has a title and text', () => {
  assert.match(TERMS_UPDATED, /^\d{4}-\d{2}-\d{2}$/);
  assert.ok(TERMS.length > 0);
  for (const s of TERMS) {
    assert.ok(s.title.trim());
    assert.ok(s.body.length > 0 && s.body.every((p) => p.trim()), `"${s.title}" needs text`);
  }
  assert.equal(new Set(TERMS.map((s) => s.title)).size, TERMS.length); // no duplicate headings
});

test('sign up is refused unless the Terms and Conditions were accepted', async () => {
  setAccountStoreForTests(null); // no accounts sheet: the older sign-up path
  delete process.env.AUTH_ENV_FILE;
  try {
    const base = { username: 'newowner', password: 'Long-Enough-Pw1!', email: 'new@gmail.com' };
    for (const acceptedTerms of [undefined, false, 'true', 1, null]) {
      const res = await attempt({ ...base, acceptedTerms });
      assert.equal(res.statusCode, 400, `acceptedTerms=${String(acceptedTerms)}`);
      assert.match(res.body.error, /Terms and Conditions/);
      assert.equal(res.body.entry, undefined); // no account was prepared
    }
    assert.equal((await attempt({ ...base, acceptedTerms: true })).statusCode, 200);
  } finally {
    setAccountStoreForTests(undefined);
  }
});
