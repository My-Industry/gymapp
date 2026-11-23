import { useState } from 'react';
import { VERSION } from '../lib/version.js';
import { ABOUT, LANGUAGES } from '../lib/aboutText.js';

const LANG_KEY = 'gym-manager.about-language';

function savedLanguage() {
  try {
    const code = localStorage.getItem(LANG_KEY);
    return LANGUAGES.some((l) => l.code === code) ? code : 'en';
  } catch {
    return 'en';
  }
}

// "**bold**" -> <b>bold</b>
function Rich({ text }) {
  return text.split('**').map((part, i) => (i % 2 ? <b key={i}>{part}</b> : part));
}

// About My Industry, the Gym Manager app, and how customer data is handled. English or Hindi.
export default function AboutPage({ onShowVersion }) {
  const [lang, setLang] = useState(savedLanguage);
  const t = ABOUT[lang];

  const choose = (code) => {
    setLang(code);
    try { localStorage.setItem(LANG_KEY, code); } catch { /* the choice just isn't remembered */ }
  };

  return (
    <div className="settings about">
      <div className="lang-toggle" role="group" aria-label="Language">
        {LANGUAGES.map((l) => (
          <button
            key={l.code}
            type="button"
            lang={l.code}
            className={lang === l.code ? 'active' : ''}
            aria-pressed={lang === l.code}
            onClick={() => choose(l.code)}
          >
            {l.label}
          </button>
        ))}
      </div>

      <div lang={lang} className="about-content">
        <section className="card narrow">
          <h2>{t.industryTitle}</h2>
          <p><Rich text={t.industryBody} /></p>
        </section>

        <section className="card narrow">
          <h2>{t.appTitle}</h2>
          <p className="muted">{t.appIntro}</p>
          <ul className="about-list">
            {t.appPoints.map((p) => <li key={p}>{p}</li>)}
          </ul>
        </section>

        <section className="card narrow">
          <h2>{t.dataTitle}</h2>
          <ul className="about-list">
            {t.dataPoints.map((p) => <li key={p}><Rich text={p} /></li>)}
          </ul>
        </section>

        <p className="muted small-text about-version">
          {t.version} {VERSION} · <button type="button" className="link" onClick={onShowVersion}>{t.releaseNotes}</button>
        </p>
      </div>
    </div>
  );
}
