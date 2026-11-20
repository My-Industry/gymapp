import { useEffect, useState } from 'react';
import GymApp from './GymApp.jsx';
import Login from './components/Login.jsx';
import SignUp from './components/SignUp.jsx';
import { fetchSession, logout } from './lib/auth.js';

export default function App() {
  // status: 'loading' | 'in' | 'out'. `session` is { user, role } when signed in.
  const [auth, setAuth] = useState({ status: 'loading', session: null, notice: '' });
  const [screen, setScreen] = useState('login'); // 'login' | 'signup'
  const [newUser, setNewUser] = useState(''); // username just created, prefilled on login

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

  if (auth.status === 'loading') {
    return <div className="login-wrap"><p className="muted">Loading…</p></div>;
  }
  if (auth.status === 'out' && screen === 'signup') {
    return (
      <SignUp
        onBack={() => setScreen('login')}
        onSignedUp={(user) => { setNewUser(user); setScreen('login'); }}
      />
    );
  }
  if (auth.status === 'out') {
    return (
      <Login
        initialUsername={newUser}
        onSignUp={() => setScreen('signup')}
        notice={auth.notice}
        onLogin={(session) => setAuth({ status: 'in', session, notice: '' })}
      />
    );
  }
  return <GymApp user={auth.session.user} role={auth.session.role} onLogout={handleLogout} />;
}
