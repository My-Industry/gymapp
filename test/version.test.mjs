// The version and release notes are edited by hand in src/lib/version.js; this keeps them consistent.
import test from 'node:test';
import assert from 'node:assert/strict';
import { VERSION, RELEASES } from '../src/lib/version.js';

const SEMVER = /^\d+\.\d+\.\d+$/;
const parts = (v) => v.split('.').map(Number);
const compare = (a, b) => {
  const [x, y] = [parts(a), parts(b)];
  for (let i = 0; i < 3; i++) if (x[i] !== y[i]) return x[i] - y[i];
  return 0;
};

test('VERSION looks like 1.2.3 and is the newest release listed', () => {
  assert.match(VERSION, SEMVER);
  assert.ok(RELEASES.length > 0);
  assert.equal(RELEASES[0].version, VERSION, 'add the new release at the TOP of RELEASES and match VERSION');
});

test('every release has a version, a date and notes, newest first, no duplicates', () => {
  for (const r of RELEASES) {
    assert.match(r.version, SEMVER);
    assert.match(r.date, /^\d{4}-\d{2}-\d{2}$/);
    assert.ok(Array.isArray(r.notes) && r.notes.length > 0 && r.notes.every((n) => n.trim()), `v${r.version} needs notes`);
  }
  for (let i = 1; i < RELEASES.length; i++) {
    assert.ok(compare(RELEASES[i - 1].version, RELEASES[i].version) > 0, 'releases must be listed newest first');
  }
});
