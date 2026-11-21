// Run with: npm test   (uses Node's built-in test runner, no extra packages)
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  normalizePhone, addMonths, calculateExpiry, parseAnyDate, parsePlan,
  nextMemberId, createMember, prepareImport, memberStatus, formatPhone, parsePackage, suggestedFee,
} from '../src/lib/members.js';

test('packages: prices, names and suggested fee', () => {
  assert.equal(suggestedFee('Basic Gym', 'Monthly'), 500);
  assert.equal(suggestedFee('Gym + Cardio', 'Monthly'), 1000);
  assert.equal(suggestedFee('Gym + Cardio', 'Yearly'), 12000);
  assert.equal(suggestedFee('Nope', 'Monthly'), null);
  assert.equal(parsePackage('gym+cardio'), 'Gym + Cardio');
  assert.equal(parsePackage('Basic'), 'Basic Gym');
  assert.equal(parsePackage('platinum'), null);
});

test('a member keeps their package; blank means Basic Gym; unknown is an error', () => {
  const base = { name: 'Asha', phone: '98765 43210', plan: 'Monthly', fee: 1000, startDate: '2026-03-01' };
  assert.equal(createMember({ ...base, gymPackage: 'Gym + Cardio' }, []).member.gymPackage, 'Gym + Cardio');
  assert.equal(createMember(base, []).member.gymPackage, 'Basic Gym');
  assert.match(createMember({ ...base, gymPackage: 'Platinum' }, []).errors[0], /Package must be/);
});

test('import reads a Package column, and an old "Package" duration column still works', () => {
  const r = prepareImport([
    { Name: 'A', Phone: '9111111111', Package: 'Gym + Cardio', Plan: 'Monthly', Fee: 1000, 'Start Date': '01/02/2026' },
    { Name: 'B', Phone: '9222222222', Package: 'Yearly', Fee: 6000, 'Start Date': '01/02/2026' }, // old file: Package = duration
  ], []);
  assert.equal(r.invalid.length, 0);
  assert.equal(r.ready[0].gymPackage, 'Gym + Cardio');
  assert.equal(r.ready[1].plan, 'Yearly');
  assert.equal(r.ready[1].gymPackage, 'Basic Gym');
});

test('phone numbers are cleaned and get the 91 prefix', () => {
  assert.equal(normalizePhone('98765 43210'), '919876543210');
  assert.equal(normalizePhone('+91-98765-43210'), '919876543210');
  assert.equal(normalizePhone('098765 43210'), '919876543210');
  assert.equal(normalizePhone('0091 9876543210'), '919876543210');
  assert.equal(normalizePhone('919876543210'), '919876543210');
  assert.equal(normalizePhone(9876543210), '919876543210');
  assert.equal(normalizePhone('12345'), null);
  assert.equal(normalizePhone('5876543210'), null);
  assert.equal(formatPhone('919876543210'), '+91 98765 43210');
});

test('expiry handles month ends', () => {
  assert.equal(addMonths('2026-01-31', 1), '2026-02-28');
  assert.equal(addMonths('2028-01-31', 1), '2028-02-29');
  assert.equal(addMonths('2026-03-31', 1), '2026-04-30');
  assert.equal(addMonths('2026-11-30', 3), '2027-02-28');
  assert.equal(addMonths('2026-08-31', 6), '2027-02-28');
  assert.equal(calculateExpiry('2026-01-15', 'Yearly'), '2027-01-15');
  assert.equal(calculateExpiry('2026-01-31', 'Monthly'), '2026-02-28');
  assert.equal(calculateExpiry('2026-12-15', 'Monthly'), '2027-01-15');
});

test('dates from spreadsheets', () => {
  assert.equal(parseAnyDate('15/01/2026'), '2026-01-15');
  assert.equal(parseAnyDate('31-01-2026'), '2026-01-31');
  assert.equal(parseAnyDate('2026-01-31'), '2026-01-31');
  assert.equal(parseAnyDate('15 Jan 2026'), '2026-01-15');
  assert.equal(parseAnyDate(46037), '2026-01-15'); // Excel serial
  assert.equal(parseAnyDate('31/02/2026'), null);
  assert.equal(parseAnyDate('hello'), null);
});

test('plans', () => {
  assert.equal(parsePlan('half yearly'), 'Half-yearly');
  assert.equal(parsePlan('6 months'), 'Half-yearly');
  assert.equal(parsePlan('Annual'), 'Yearly');
  assert.equal(parsePlan('weekly'), null);
});

test('member IDs and duplicate phones', () => {
  assert.equal(nextMemberId([]), 'GYM-000001');
  const a = createMember({ name: ' Ravi  Kumar ', phone: '98765 43210', plan: 'Monthly', fee: '1,500', startDate: '2026-01-31', whatsappConsent: true }, []);
  assert.deepEqual(a.errors, []);
  assert.equal(a.member.id, 'GYM-000001');
  assert.equal(a.member.name, 'Ravi Kumar');
  assert.equal(a.member.fee, 1500);
  assert.equal(a.member.expiryDate, '2026-02-28');

  const dup = createMember({ name: 'Someone', phone: '+91 98765-43210', plan: 'Yearly', fee: 9000, startDate: '2026-02-01' }, [a.member]);
  assert.match(dup.errors[0], /already registered/);

  const b = createMember({ name: 'Priya', phone: '9123456789', plan: 'Quarterly', fee: 4000, startDate: '2026-02-01' }, [a.member]);
  assert.equal(b.member.id, 'GYM-000002');
});

test('bulk import sorts rows into ready / duplicate / invalid', () => {
  const existing = [createMember({ name: 'Old', phone: '9000000001', plan: 'Monthly', fee: 1000, startDate: '2026-01-01' }, []).member];
  const rows = [
    { Name: 'A', 'Mobile No': '9111111111', Plan: 'Monthly', Fees: 1500, 'Joining Date': '31/01/2026', WhatsApp: 'Yes' },
    { Name: 'B', Mobile: '+91 91111 11111', Plan: 'Yearly', Fees: 9000, 'Joining Date': '01/02/2026' }, // dup within file
    { Name: 'C', Mobile: '9000000001', Plan: 'Yearly', Fees: 9000, 'Joining Date': '01/02/2026' },        // dup of existing
    { Name: '', Mobile: '123', Plan: 'Weekly', Fees: 'abc', 'Joining Date': 'x' },                         // invalid
    { Name: '', Mobile: '', Plan: '', Fees: '', 'Joining Date': '' },                                       // blank, skipped
    { Name: 'D', Mobile: '9222222222', Plan: '6 months', Fees: '₹ 5,000', 'Joining Date': 46037 },
  ];
  const r = prepareImport(rows, existing);
  assert.equal(r.ready.length, 2);
  assert.deepEqual(r.ready.map((m) => m.id), ['GYM-000002', 'GYM-000003']);
  assert.equal(r.ready[0].expiryDate, '2026-02-28');
  assert.equal(r.ready[0].whatsappConsent, true);
  assert.equal(r.ready[1].plan, 'Half-yearly');
  assert.equal(r.ready[1].fee, 5000);
  assert.equal(r.duplicates.length, 2);
  assert.deepEqual(r.duplicates.map((d) => d.rowNumber), [3, 4]);
  assert.equal(r.invalid.length, 1);
  assert.equal(r.invalid[0].rowNumber, 5);
  assert.equal(r.invalid[0].errors.length, 5);
});

test('status', () => {
  assert.equal(memberStatus({ expiryDate: '2026-11-20' }, '2026-11-21').key, 'expired');
  assert.equal(memberStatus({ expiryDate: '2026-11-25' }, '2026-11-21').key, 'expiring');
  assert.equal(memberStatus({ expiryDate: '2026-12-25' }, '2026-11-21').key, 'active');
});
