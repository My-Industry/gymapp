import { useState } from 'react';
import { signup } from '../lib/auth.js';
import TermsPage from './TermsPage.jsx';

export default function SignUp({ onSignedUp, onBack }) {
  const [agreed, setAgreed] = useState(false); // accepted the Terms and Conditions
  const [showTerms, setShowTerms] = useState(false); // reading them (the form below keeps what was typed)
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState(null); // { user, saved, entry }
  const [copied, setCopied] = useState(false);

  const mismatch = confirm.length > 0 && confirm !== password;

  async function submit(e) {
    e.preventDefault();
    if (busy) return;
    if (password !== confirm) {
      setError("The two passwords don't match.");
      return;
    }
    if (!agreed) {
      setError('Please accept the Terms and Conditions to create an account.');
      return;
    }
    setBusy(true);
    setError('');
    const r = await signup(username, password, email, agreed);
    setBusy(false);
    setPassword('');
    setConfirm('');
    if (r.error) setError(r.error);
    else setResult(r);
  }

  async function copy() {
    try {
      await navigator.clipboard.writeText(result.entry);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  }

  if (showTerms) return <TermsPage onBack={() => setShowTerms(false)} />;

  if (result?.storage === 'sheet') {
    return (
      <div className="login-wrap">
        <div className="card login-card form">
          <div className="login-brand">
            <span className="logo" aria-hidden>✅</span>
            <h1>Account created</h1>
          </div>
          <div className="alert success">
            Welcome, <b>{result.user}</b>! Your account is ready. You can sign in now.
          </div>
          <button type="button" className="primary" onClick={() => onSignedUp(result.user)}>Go to sign in</button>
        </div>
      </div>
    );
  }

  if (result) {
    return (
      <div className="login-wrap">
        <div className="card login-card form">
          <div className="login-brand">
            <span className="logo" aria-hidden>{result.saved ? '✅' : '📋'}</span>
            <h1>{result.saved ? 'Account created' : 'Almost done'}</h1>
          </div>

          {result.saved ? (
            <div className="alert success">
              <b>{result.user}</b> was saved to <code>.env.local</code>. You can sign in now.
            </div>
          ) : (
            <div className="alert success">
              Your login for <b>{result.user}</b> is ready, but it isn't active yet.
            </div>
          )}

          <p className="muted small-text">
            {result.saved
              ? 'To use this account on the deployed site too, add this to AUTH_USERS in Vercel (separate users with a comma), then redeploy:'
              : 'In Vercel → Project → Settings → Environment Variables, add this to AUTH_USERS (separate users with a comma), then redeploy. If you are not the owner, send it to them:'}
          </p>
          <textarea className="entry" readOnly rows={4} value={result.entry} onFocus={(e) => e.target.select()} />
          <div className="import-actions">
            <button type="button" className="secondary" onClick={copy}>{copied ? 'Copied ✓' : 'Copy'}</button>
            <button type="button" className="primary" onClick={() => onSignedUp(result.user)}>Go to sign in</button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="login-wrap">
      <form className="card login-card form" onSubmit={submit}>
        <div className="login-brand">
          <span className="logo" aria-hidden>🏋️</span>
          <h1>Create account</h1>
          <p className="muted">Choose a username, email and password</p>
        </div>

        {error && <div className="alert error" role="alert">{error}</div>}

        <label>
          Username
          <input
            type="text"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            autoComplete="username"
            autoCapitalize="none"
            autoFocus
            required
          />
          <span className="hint muted">3–32 characters: letters, numbers, . - _</span>
        </label>
        <label>
          Email address
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoComplete="email"
            autoCapitalize="none"
            placeholder="you@gmail.com"
            required
          />
          <span className="hint muted">Used to reset your password if you forget it</span>
        </label>
        <label>
          Password
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="new-password"
            minLength={8}
            required
          />
          <span className="hint muted">At least 8 characters</span>
        </label>
        <label>
          Confirm password
          <input
            type="password"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            autoComplete="new-password"
            required
          />
          {mismatch && <span className="hint bad">Passwords don't match</span>}
        </label>

        <label className="check terms-check">
          <input type="checkbox" checked={agreed} onChange={(e) => setAgreed(e.target.checked)} />
          <span>
            I agree to the{' '}
            <button type="button" className="link terms-link" onClick={() => setShowTerms(true)}>
              Terms and Conditions
            </button>
          </span>
        </label>

        <button className="primary" type="submit" disabled={busy || !agreed || !username || !email || !password || !confirm || mismatch}>
          {busy ? 'Creating…' : 'Create account'}
        </button>
        <button type="button" className="link center" onClick={onBack}>
          Already have an account? Sign in
        </button>
      </form>
    </div>
  );
}
