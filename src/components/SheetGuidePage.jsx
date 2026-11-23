import { useEffect } from 'react';
import { GUIDE_INTRO, GUIDE_PROBLEMS, GUIDE_STEPS } from '../lib/sheetGuide.js';

// The tutorial: how to connect your own Google Sheet, step by step.
export default function SheetGuidePage({ onBack, onConnect, canConnect }) {
  useEffect(() => { window.scrollTo(0, 0); }, []);

  return (
    <div className="guide">
      <section className="card guide-card">
        <div className="guide-head">
          <h2>How to connect your Google Sheet</h2>
          <button type="button" className="secondary small" onClick={onBack}>← Back</button>
        </div>
        <p className="muted">{GUIDE_INTRO}</p>

        <ol className="guide-steps">
          {GUIDE_STEPS.map((step) => (
            <li key={step.title}>
              <h3>{step.title}</h3>
              {step.body.map((line) => <p key={line}>{line}</p>)}
              {step.note && <p className="guide-note">{step.note}</p>}
              {step.links?.map((l) => (
                <a key={l.href} className="guide-link" href={l.href} target="_blank" rel="noopener noreferrer">
                  {l.label} ↗
                </a>
              ))}
            </li>
          ))}
        </ol>

        <h3 className="guide-sub">If something goes wrong</h3>
        <dl className="guide-problems">
          {GUIDE_PROBLEMS.map((p) => (
            <div key={p.problem}>
              <dt>{p.problem}</dt>
              <dd>{p.fix}</dd>
            </div>
          ))}
        </dl>

        <div className="form-actions guide-foot">
          {canConnect && <button type="button" className="primary" onClick={onConnect}>Go to Settings</button>}
          <button type="button" className="secondary" onClick={onBack}>← Back</button>
        </div>
      </section>
    </div>
  );
}
