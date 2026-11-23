import { useState } from 'react';
import { forgotPassword } from '../lib/auth.js';

// Step 1 of a password reset: ask for the account's email. The answer is always the same,
// so the page never reveals whether an email has an account.
export default function ForgotPassword({ onBack }) {
  const [email, setEmail] = useState('');
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(e) {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setError('');
    const r = await forgotPassword(email);
    setBusy(false);
    if (r.error) setError(r.error);
    else setMessage(r.message || "If that email has an account, we've sent a link to reset the password.");
  }

  if (message) {
    return (
      <div className="login-wrap">
        <div className="card login-card form">
          <div className="login-brand">
            <span className="logo" aria-hidden>📧</span>
            <h1>Check your email</h1>
          </div>
          <div className="alert success" role="status">{message}</div>
          <p className="muted small-text">The link works for one hour. Didn't get it? Check your spam folder, or try again.</p>
          <button type="button" className="primary" onClick={onBack}>Back to sign in</button>
        </div>
      </div>
    );
  }

  return (
    <div className="login-wrap">
      <form className="card login-card form" onSubmit={submit}>
        <div className="login-brand">
          <span className="logo" aria-hidden>🔑</span>
          <h1>Forgot password?</h1>
          <p className="muted">Enter the email you signed up with and we'll send you a reset link</p>
        </div>
        {error && <div className="alert error" role="alert">{error}</div>}
        <label>Email address
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)}
            autoComplete="email" autoCapitalize="none" placeholder="you@gmail.com" autoFocus required/>
        </label>
        <button className="primary" type="submit" disabled={busy || !email}>{busy ? 'Sending…' : 'Send reset link'}</button>
        <button type="button" className="link center" onClick={onBack}>Back to sign in</button>
      </form>
    </div>
  );
}
