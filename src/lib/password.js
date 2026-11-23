// Password rules, used by the Sign up and Reset password screens (to show the checklist and strength)
// and by the server (to enforce them). Required: at least 8 characters, an uppercase letter,
// a lowercase letter and a special character.

export const MIN_PASSWORD = 8;
export const MAX_PASSWORD = 200;

export const PASSWORD_RULES = [
  { id: 'length', label: `At least ${MIN_PASSWORD} characters`, test: (p) => p.length >= MIN_PASSWORD },
  { id: 'upper', label: 'An uppercase letter (A–Z)', short: 'an uppercase letter', test: (p) => /\p{Lu}/u.test(p) },
  { id: 'lower', label: 'A lowercase letter (a–z)', short: 'a lowercase letter', test: (p) => /\p{Ll}/u.test(p) },
  { id: 'special', label: 'A special character (! @ # $ % …)', short: 'a special character such as ! @ # $ %', test: (p) => /[^\p{L}\p{N}\s]/u.test(p) },
];

/** Checks a password. Returns { rules: [{ id, label, ok }], ok } - ok when every required rule is met. */
export function checkPassword(input) {
  const p = String(input ?? '');
  const rules = PASSWORD_RULES.map((r) => ({ id: r.id, label: r.label, ok: r.test(p) }));
  return { rules, ok: rules.every((r) => r.ok) };
}

/**
 * The four bars under the password box. `met` = how many of the four rules are met (bars lit), and
 * `color`: 'red' for 1–2 rules, 'yellow' for 3, 'green' when all four are met (then every bar is green).
 * Nothing typed (or no rule met) lights nothing: color is ''.
 */
export function passwordBars(input) {
  const p = String(input ?? '');
  const met = PASSWORD_RULES.filter((r) => r.test(p)).length;
  if (!p || met === 0) return { met: 0, color: '' };
  return { met, color: met === PASSWORD_RULES.length ? 'green' : met === 3 ? 'yellow' : 'red' };
}

/** An error message for the server, or '' when the password is acceptable. */
export function passwordProblem(input) {
  const p = String(input ?? '');
  if (p.length > MAX_PASSWORD) return 'Password is too long.';
  if (p.length < MIN_PASSWORD) return `Password must be at least ${MIN_PASSWORD} characters.`;
  const missing = PASSWORD_RULES.filter((r) => !r.test(p)).map((r) => r.short);
  if (!missing.length) return '';
  const list = missing.length === 1 ? missing[0] : `${missing.slice(0, -1).join(', ')} and ${missing.at(-1)}`;
  return `Password must also contain ${list}.`;
}
