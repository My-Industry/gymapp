import { passwordBars } from '../lib/password.js';

const WORDS = { red: 'weak', yellow: 'almost there', green: 'strong' };

// Four bars under a "new password" field. They start grey; each rule the password meets lights one
// more bar: red for 1–2 rules, yellow for 3, and all four green when every rule is met.
export default function PasswordStrength({ password }) {
  const { met, color } = passwordBars(password);

  return (
    <div className="pw-strength">
      <div className="pw-bars" aria-hidden="true">
        {[1, 2, 3, 4].map((n) => (
          <span key={n} className={n <= met ? `on ${color}` : ''} />
        ))}
      </div>
      <p className="hint muted">Use 8+ characters with an uppercase letter, a lowercase letter and a special character.</p>
      <span className="sr-only" aria-live="polite">
        {met === 0 ? '' : `Password strength: ${met} of 4 requirements met, ${WORDS[color]}.`}
      </span>
    </div>
  );
}
