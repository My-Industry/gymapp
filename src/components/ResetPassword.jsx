import { useState } from 'react';
import { resetPassword } from '../lib/auth.js';
import { checkPassword } from '../lib/password.js';
import PasswordStrength from './PasswordStrength.jsx';

// Step 2 of a password reset: the page the emailed link (/?reset=<token>) opens.
export default function ResetPassword({ token, onDone, onBack }) {
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const mismatch = confirm.length > 0 && confirm !== password;
  const strongEnough = checkPassword(password).ok;

  async function submit(e) {
    e.preventDefault();
    if (busy) return;
    if (password !== confirm) {
      setError("The two passwords don't match.");
      return;
    }
    setBusy(true);
    setError('');
    const r = await resetPassword(token, password);
    setBusy(false);
    if (r.error) setError(r.error);
    else onDone();
  }

  return (
    <div className="login-wrap">
      <form className="card login-card form" onSubmit={submit}>
        <div className="login-brand">
          <span className="logo" aria-hidden>🔑</span>
          <h1>Choose a new password</h1>
        </div>
        {error && <div className="alert error" role="alert">{error}</div>}
        <label>New password
          <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="new-password" minLength={8} autoFocus required />
        </label>
        <PasswordStrength password={password} />
        <label>
          Confirm new password
          <input type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} autoComplete="new-password" required />
          {mismatch && <span className="hint bad">Passwords don't match</span>}
        </label>

        <button className="primary" type="submit" disabled={busy || !strongEnough || !confirm || mismatch}>
          {busy ? 'Saving…' : 'Change password'}
        </button>
        <button type="button" className="link center" onClick={onBack}>Back to sign in</button>
      </form>
    </div>
  );
}
