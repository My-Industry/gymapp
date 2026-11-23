// The Google Sheet tutorial must be complete: every step has a title and text, links are https.
import test from 'node:test';
import assert from 'node:assert/strict';
import { GUIDE_INTRO, GUIDE_STEPS, GUIDE_PROBLEMS } from '../src/lib/sheetGuide.js';

test('every tutorial step has a title and text, and links are safe https links', () => {
  assert.ok(GUIDE_INTRO.trim());
  assert.ok(GUIDE_STEPS.length >= 5);
  assert.equal(new Set(GUIDE_STEPS.map((s) => s.title)).size, GUIDE_STEPS.length);
  for (const s of GUIDE_STEPS) {
    assert.ok(s.title.trim());
    assert.ok(s.body.length > 0 && s.body.every((l) => l.trim()), `"${s.title}" needs text`);
    for (const link of s.links || []) {
      assert.ok(link.label.trim());
      assert.match(link.href, /^https:\/\//);
    }
  }
});

test('the tutorial covers sharing the sheet, the key and the connect step, and lists fixes', () => {
  const text = GUIDE_STEPS.flatMap((s) => [s.title, ...s.body]).join(' ');
  for (const word of ['Share', 'Editor', 'client_email', 'private_key', 'Connect']) assert.ok(text.includes(word), word);
  assert.ok(GUIDE_PROBLEMS.length > 0 && GUIDE_PROBLEMS.every((p) => p.problem.trim() && p.fix.trim()));
});
