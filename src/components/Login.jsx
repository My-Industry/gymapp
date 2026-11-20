import { useState } from 'react';
import { login } from '../lib/auth.js';

export default function Login({ onLogin, onSignUp, notice = '', initialUsername = '' }) {
  const [username, setUsername] = useState(initialUsername);
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(e) {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setError('');
    const result = await login(username, password);
    setBusy(false);
    if (result.user) onLogin(result);
    else {
      setError(result.error);
      setPassword('');
    }
  }

  return (
    <div className="login-wrap">
      <form className="card login-card form" onSubmit={submit}>
        <div className="login-brand">
          <span className="logo" aria-hidden>🏋️</span>
          <h1>Gym Manager</h1>
          <p className="muted">Sign in to continue</p>
        </div>

        {(error || notice) && <div className="alert error" role="alert">{error || notice}</div>}

        <label>
          Username
          <input
            type="text"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            autoComplete="username"
            autoCapitalize="none"
            autoFocus={!initialUsername}
            required
          />
        </label>
        <label>
          Password
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="current-password"
            autoFocus={!!initialUsername}
            required
          />
        </label>

        <button className="primary" type="submit" disabled={busy || !username || !password}>
          {busy ? 'Signing in…' : 'Sign in'}
        </button>
        <button type="button" className="link center" onClick={onSignUp}>
          New here? Create an account
        </button>
      </form>
    </div>
  );
}
