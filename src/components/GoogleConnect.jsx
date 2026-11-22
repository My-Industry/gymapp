import { useEffect, useRef, useState } from 'react';
import { connectSheet, disconnectSheet, getConnection } from '../lib/storage.js';

// Profile -> Google Sheets. "Connect" opens a form for the service account email, its private key and
// the sheet link. The server tests them against Google, then saves them (key encrypted).
export default function GoogleConnect({
  onChange,
  onUnauthorized,
  title = 'Google Sheets',
  startOpen = false,
  intro = 'Connect your own Google Sheet and your members, monthly records and history are stored there.',
}) {
  const [state, setState] = useState({ status: 'loading', info: null, error: '' });
  const [open, setOpen] = useState(startOpen);
  const [form, setForm] = useState({ serviceEmail: '', privateKey: '', sheetLink: '' });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [justConnected, setJustConnected] = useState(false);

  const unauthorized = useRef(onUnauthorized);
  unauthorized.current = onUnauthorized;

  useEffect(() => {
    let cancelled = false;
    getConnection()
      .then((info) => { if (!cancelled) setState({ status: 'ready', info, error: '' }); })
      .catch((err) => {
        if (cancelled) return;
        if (err.unauthorized) { unauthorized.current?.(); return; }
        setState({ status: 'error', info: null, error: err.message });
      });
    return () => { cancelled = true; };
  }, []);

  const set = (field) => (e) => { setForm((f) => ({ ...f, [field]: e.target.value })); setError(''); };

  async function submit(e) {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setError('');
    try {
      const info = await connectSheet(form);
      setState({ status: 'ready', info, error: '' });
      setForm({ serviceEmail: '', privateKey: '', sheetLink: '' }); // don't keep the key in the page
      setOpen(false);
      setJustConnected(true);
      onChange?.();
    } catch (err) {
      if (err.unauthorized) unauthorized.current?.();
      else setError(err.message);
    }
    setBusy(false);
  }

  async function disconnect() {
    if (!window.confirm('Disconnect this Google Sheet? The app will stop using it. Your sheet is not deleted.')) return;
    setBusy(true);
    setError('');
    try {
      const info = await disconnectSheet();
      setState({ status: 'ready', info, error: '' });
      setJustConnected(false);
      onChange?.();
    } catch (err) {
      if (err.unauthorized) unauthorized.current?.();
      else setError(err.message);
    }
    setBusy(false);
  }

  const { info } = state;

  return (
    <div className="card narrow connect-card">
      <h2>{title}</h2>

      {state.status === 'loading' && <p className="muted">Checking…</p>}
      {state.status === 'error' && <div className="alert error" role="alert">{state.error}</div>}

      {state.status === 'ready' && info?.connected && (
        <>
          <div className="alert success">
            {justConnected ? 'Connected. ' : ''}Your members are stored in your Google Sheet.
          </div>
          {error && <div className="alert error" role="alert">{error}</div>}
          <dl className="facts">
            <dt>Service account</dt><dd className="mono">{info.serviceEmail}</dd>
            <dt>Sheet</dt>
            <dd>
              <a href={`https://docs.google.com/spreadsheets/d/${info.sheetId}`} target="_blank" rel="noreferrer">
                Open the sheet ↗
              </a>
            </dd>
          </dl>
          <div className="import-actions">
            <button className="secondary" onClick={disconnect} disabled={busy}>Disconnect</button>
          </div>
        </>
      )}

      {state.status === 'ready' && !info?.connected && !open && (
        <>
          <p className="muted small-text">{intro}</p>
          <button className="primary" onClick={() => setOpen(true)}>Connect</button>
        </>
      )}

      {state.status === 'ready' && !info?.connected && open && (
        <form className="form connect-form" onSubmit={submit}>
          {error && <div className="alert error" role="alert">{error}</div>}

          <label>
            Service account email
            <input
              type="text" value={form.serviceEmail} onChange={set('serviceEmail')}
              placeholder="gym-app@your-project.iam.gserviceaccount.com"
              autoComplete="off" autoCapitalize="none" spellCheck={false} autoFocus required
            />
            <span className="hint muted">The <code>client_email</code> from your Google service account key (JSON file).</span>
          </label>
          <label>
            Private key
            <textarea
              className="entry" rows={6} value={form.privateKey} onChange={set('privateKey')}
              placeholder={'-----BEGIN PRIVATE KEY-----\n…\n-----END PRIVATE KEY-----'}
              autoComplete="off" autoCapitalize="none" spellCheck={false} required
            />
            <span className="hint muted">
              The <code>private_key</code> from the same file. It is encrypted before it is saved and is never shown again.
            </span>
          </label>
          <label>
            Google Sheet link
            <input
              type="text" value={form.sheetLink} onChange={set('sheetLink')}
              placeholder="https://docs.google.com/spreadsheets/d/…"
              autoComplete="off" autoCapitalize="none" spellCheck={false} required
            />
            <span className="hint muted">
              Share this sheet with the service account email above and give it <b>Editor</b> access.
            </span>
          </label>

          <div className="form-actions">
            <button className="primary" type="submit" disabled={busy || !form.serviceEmail || !form.privateKey || !form.sheetLink}>
              {busy ? 'Connecting…' : 'Connect'}
            </button>
            <button className="secondary" type="button" onClick={() => { setOpen(false); setError(''); }} disabled={busy}>
              Cancel
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
