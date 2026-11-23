import { useState } from 'react';
import {
  bmiCategory, calculateBmi, formatDate, parseBodyDetails, HEIGHT_RANGE, WEIGHT_RANGE,
} from '../lib/members.js';

// A quick form to record a member's new weight and height. It saves to the member and to THIS
// month's record, so the History page can show how they change from month to month.
export default function MeasurementsForm({ member, onSave, onCancel }) {
  const [form, setForm] = useState({
    weightKg: member.weightKg == null ? '' : String(member.weightKg),
    heightCm: member.heightCm == null ? '' : String(member.heightCm),
  });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const set = (field) => (e) => { setForm((f) => ({ ...f, [field]: e.target.value })); setError(''); };

  const body = parseBodyDetails({ ...form, dateOfBirth: member.dateOfBirth });
  const bmi = body.errors.length === 0 ? calculateBmi(body.weightKg, body.heightCm) : null;
  const group = bmiCategory(bmi);
  const unchanged = body.weightKg === (member.weightKg ?? null) && body.heightCm === (member.heightCm ?? null);

  const submit = async (e) => {
    e.preventDefault();
    if (body.errors.length) { setError(body.errors[0]); return; }
    if (body.weightKg === null && body.heightCm === null) { setError('Enter a weight or a height.'); return; }
    setBusy(true);
    try {
      await onSave({ ...member, weightKg: body.weightKg, heightCm: body.heightCm });
    } catch (err) {
      setError(err.message || "Couldn't save. Please try again.");
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} className="form edit-form" noValidate>
      <h3>Update weight &amp; height</h3>
      <p className="muted small-text">
        This is saved in {member.name}'s record for the current month, so you can follow how it changes month by month
        on the History page. Updating twice in a month replaces that month's value.
      </p>

      {error && <div className="alert error" role="alert"><ul><li>{error}</li></ul></div>}

      <div className="row">
        <label>
          Weight (kg)
          <input value={form.weightKg} onChange={set('weightKg')} inputMode="decimal" placeholder={`${WEIGHT_RANGE.min}–${WEIGHT_RANGE.max}`} autoFocus autoComplete="off" />
          {member.weightKg && <small className="hint muted">Last: {member.weightKg} kg</small>}
        </label>
        <label>
          Height (cm)
          <input value={form.heightCm} onChange={set('heightCm')} inputMode="decimal" placeholder={`${HEIGHT_RANGE.min}–${HEIGHT_RANGE.max}`} autoComplete="off" />
          {member.heightCm && <small className="hint muted">Last: {member.heightCm} cm</small>}
        </label>
      </div>

      {bmi !== null && (
        <div className="bmi-preview" aria-live="polite">
          BMI <b>{bmi}</b> <span className={`badge bmi-${group.key}`}>{group.label}</span>
        </div>
      )}

      <div className="form-actions">
        <button type="submit" className="primary" disabled={busy || unchanged}>
          {busy ? 'Saving…' : 'Save'}
        </button>
        <button type="button" className="secondary" onClick={onCancel} disabled={busy}>Cancel</button>
      </div>
      {unchanged && <small className="hint muted">Change the weight or height to save. Today is {formatDate(new Date().toISOString().slice(0, 10))}.</small>}
    </form>
  );
}
