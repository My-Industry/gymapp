import { useEffect, useState } from 'react';
import GymApp from './GymApp.jsx';
import Login from './components/Login.jsx';
import SignUp from './components/SignUp.jsx';
import ForgotPassword from './components/ForgotPassword.jsx';
import ResetPassword from './components/ResetPassword.jsx';
import { fetchSession, logout } from './lib/auth.js';

// The emailed reset link opens the app at /?reset=<token>.
const tokenFromUrl = () => new URLSearchParams(window.location.search).get('reset') || '';
const clearTokenFromUrl = () => window.history.replaceState(null, '', window.location.pathname);

export default function App() {
  // status: 'loading' | 'in' | 'out'. `session` is { user, role } when signed in.
  const [auth, setAuth] = useState({ status: 'loading', session: null, notice: '' });
  const [screen, setScreen] = useState('login'); // 'login' | 'signup' | 'forgot'
  const [newUser, setNewUser] = useState(''); // username just created, prefilled on login
  const [resetToken, setResetToken] = useState(tokenFromUrl);
  const [loginNote, setLoginNote] = useState(''); // e.g. "Password changed"

  useEffect(() => {
    let cancelled = false;
    fetchSession()
      .then((session) => {
        if (!cancelled) setAuth({ status: session ? 'in' : 'out', session, notice: '' });
      })
      .catch(() => {
        if (!cancelled) {
          setAuth({ status: 'out', session: null, notice: "Can't reach the server to check your session." });
        }
      });
    return () => { cancelled = true; };
  }, []);

  async function handleLogout() {
    await logout();
    setAuth({ status: 'out', session: null, notice: '' });
  }

  const leaveReset = () => {
    clearTokenFromUrl();
    setResetToken('');
    setScreen('login');
  };

  if (auth.status === 'loading') {
    return <div className="login-wrap"><p className="muted">Loading…</p></div>;
  }
  if (resetToken) {
    return (
      <ResetPassword
        token={resetToken}
        onBack={leaveReset}
        onDone={() => { setLoginNote('Your password was changed. Sign in with the new one.'); leaveReset(); }}
      />
    );
  }
  if (auth.status === 'out' && screen === 'signup') {
    return (
      <SignUp
        onBack={() => setScreen('login')}
        onSignedUp={(user) => { setNewUser(user); setScreen('login'); }}
      />
    );
  }
  if (auth.status === 'out' && screen === 'forgot') {
    return <ForgotPassword onBack={() => setScreen('login')} />;
  }
  if (auth.status === 'out') {
    return (
      <Login
        initialUsername={newUser}
        onSignUp={() => { setLoginNote(''); setScreen('signup'); }}
        onForgot={() => { setLoginNote(''); setScreen('forgot'); }}
        notice={auth.notice}
        success={loginNote}
        onLogin={(session) => setAuth({ status: 'in', session, notice: '' })}
      />
    );
  }
  return <GymApp user={auth.session.user} role={auth.session.role} onLogout={handleLogout} />;
}
