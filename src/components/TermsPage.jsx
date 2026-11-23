import { useEffect } from 'react';
import { TERMS, TERMS_UPDATED } from '../lib/terms.js';
import { formatDate } from '../lib/members.js';

// The Terms and Conditions, shown on their own screen for people who are not signed in yet.
// There is nothing else on this screen to click: only Back (top right and bottom).
export default function TermsPage({ onBack }) {
  useEffect(() => { window.scrollTo(0, 0); }, []);

  return (
    <div className="login-wrap terms-wrap">
      <article className="card terms-card">
        <div className="terms-head">
          <div>
            <h1>Terms and Conditions</h1>
            <p className="muted small-text">Last updated {formatDate(TERMS_UPDATED)}</p>
          </div>
          <button type="button" className="secondary small" onClick={onBack}>← Back</button>
        </div>

        {TERMS.map((section) => (
          <section key={section.title} className="terms-section">
            <h2>{section.title}</h2>
            {section.body.map((p) => <p key={p}>{p}</p>)}
          </section>
        ))}

        <div className="terms-foot">
          <button type="button" className="primary" onClick={onBack}>← Back to sign up</button>
        </div>
      </article>
    </div>
  );
}
