// The About page is written in English and Hindi; the two must stay in step.
import test from 'node:test';
import assert from 'node:assert/strict';
import { ABOUT, LANGUAGES } from '../src/lib/aboutText.js';

test('every language has the same sections and the same number of bullets', () => {
  const [base, ...others] = LANGUAGES.map((l) => ABOUT[l.code]);
  assert.ok(base && others.length > 0);
  for (const other of others) {
    assert.deepEqual(Object.keys(other).sort(), Object.keys(base).sort());
    assert.equal(other.appPoints.length, base.appPoints.length);
    assert.equal(other.dataPoints.length, base.dataPoints.length);
  }
});

test('no text is empty, and bold markers are paired', () => {
  for (const { code } of LANGUAGES) {
    const t = ABOUT[code];
    const all = [t.industryTitle, t.industryBody, t.appTitle, t.appIntro, t.dataTitle, t.version, t.releaseNotes,
      ...t.appPoints, ...t.dataPoints];
    for (const text of all) {
      assert.ok(text.trim(), `${code}: empty text`);
      assert.equal(text.split('**').length % 2, 1, `${code}: unpaired ** in "${text.slice(0, 40)}"`);
    }
  }
});

test('each language is written in its own script', () => {
  const scripts = {
    devanagari: /[ऀ-ॣ०-ॿ]/, // Hindi, Marathi (the "।" full stop, U+0964, is shared with Punjabi)
    gurmukhi: /[਀-੿]/, // Punjabi
    tamil: /[஀-௿]/, // Tamil
  };
  const expected = { en: [], hi: ['devanagari'], mr: ['devanagari'], pa: ['gurmukhi'], ta: ['tamil'] };
  assert.deepEqual(LANGUAGES.map((l) => l.code), ['en', 'hi', 'mr', 'pa', 'ta']);
  for (const [code, names] of Object.entries(expected)) {
    const t = ABOUT[code];
    const text = [t.industryTitle, t.industryBody, t.appIntro, t.dataTitle, ...t.appPoints, ...t.dataPoints].join(' ');
    for (const [name, re] of Object.entries(scripts)) {
      if (names.includes(name)) assert.match(t.dataTitle, re, `${code} should use ${name}`);
      else assert.doesNotMatch(text, re, `${code} should not contain ${name} letters`);
    }
  }
});

test('Marathi is not just a copy of the Hindi text', () => {
  assert.notEqual(ABOUT.mr.dataTitle, ABOUT.hi.dataTitle);
  assert.notEqual(ABOUT.mr.industryBody, ABOUT.hi.industryBody);
});
