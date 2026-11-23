import { useMemo, useState } from 'react';
import BodyStatsFields from './BodyStatsFields.jsx';
import {
  PLAN_NAMES, PACKAGES, PACKAGE_NAMES, DEFAULT_PACKAGE, suggestedFee, planFromFee, validateMember, normalizePhone,
  formatPhone, findByPhone, calculateExpiry, formatDate, isValidISODate, todayISO,
} from '../lib/members.js';

const inr = new Intl.NumberFormat('en-IN');

// Edit one member: change their package / duration (upgrade or renew) or fix their details.
export default function MemberEditForm({ member, members, onSave, onCancel }) {
  const [form, setForm] = useState(() => ({
    name: member.name,
    phone: member.phone,
    gymPackage: member.gymPackage || DEFAULT_PACKAGE,
    plan: member.plan,
    fee: String(member.fee),
    startDate: member.startDate,
    dateOfBirth: member.dateOfBirth || '',
    weightKg: member.weightKg == null ? '' : String(member.weightKg),
    heightCm: member.heightCm == null ? '' : String(member.heightCm),
    whatsappConsent: member.whatsappConsent,
  }));
  const [feeEdited, setFeeEdited] = useState(false); // once typed by hand, stop auto-filling
  const [errors, setErrors] = useState([]);
  const [busy, setBusy] = useState(false);

  const set = (field) => (e) => {
    const value = e.target.type === 'checkbox' ? e.target.checked : e.target.value;
    if (field === 'fee') setFeeEdited(true);
    setForm((f) => {
      const next = { ...f, [field]: value };
      if (field === 'fee') {
        // The amount decides the duration: ₹1,000 on a ₹500/month package = 2 months.
        next.plan = planFromFee(next.gymPackage, value, f.plan);
      } else if (field === 'gymPackage' || field === 'plan') {
        if (!feeEdited) next.fee = String(suggestedFee(next.gymPackage, next.plan) ?? f.fee);
        else if (field === 'gymPackage') next.plan = planFromFee(next.gymPackage, next.fee, next.plan);
      }
      return next;
    });
    setErrors([]);
  };

  const others = useMemo(() => members.filter((m) => m.id !== member.id), [members, member.id]);
  const cleanPhone = normalizePhone(form.phone);
  const duplicate = cleanPhone ? findByPhone(others, cleanPhone) : null;
  const expiry = useMemo(
    () => (isValidISODate(form.startDate) && form.plan ? calculateExpiry(form.startDate, form.plan) : null),
    [form.startDate, form.plan],
  );
  const standardFee = suggestedFee(form.gymPackage, form.plan);
  const changed = form.gymPackage !== (member.gymPackage || DEFAULT_PACKAGE) || form.plan !== member.plan;

  const submit = async (e) => {
    e.preventDefault();
    const result = validateMember(form, others);
    if (result.errors.length) {
      setErrors(result.errors);
      return;
    }
    setBusy(true);
    try {
      await onSave({ ...member, ...result.member });
    } catch (err) {
      setErrors([err.message || "Couldn't save the changes. Please try again."]);
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} className="form edit-form" noValidate>
      <h3>Update member</h3>

      {errors.length > 0 && (
        <div className="alert error">
          <ul>{errors.map((err) => <li key={err}>{err}</li>)}</ul>
        </div>
      )}

      <div className="row">
        <label>
          Package
          <select value={form.gymPackage} onChange={set('gymPackage')}>
            {PACKAGE_NAMES.map((p) => (
              <option key={p} value={p}>{p} — ₹{inr.format(PACKAGES[p])}/month</option>
            ))}
          </select>
        </label>
        <label>
          Duration
          <select value={form.plan} onChange={set('plan')}>
            {(PLAN_NAMES.includes(form.plan) ? PLAN_NAMES : [...PLAN_NAMES, form.plan])
              .map((p) => <option key={p}>{p}</option>)}
          </select>
        </label>
      </div>

      <label>
        Fee (₹)
        <input value={form.fee} onChange={set('fee')} inputMode="decimal" />
        {standardFee && (
          <small className="hint muted">
            {Number(form.fee) === standardFee
              ? `Standard fee: ₹${inr.format(standardFee)}`
              : `Standard fee is ₹${inr.format(standardFee)}; this member pays ₹${inr.format(Number(form.fee) || 0)}.`}
          </small>
        )}
      </label>

      <div className="row">
        <label>
          Start date
          <input type="date" value={form.startDate} onChange={set('startDate')} />
          <button
            type="button" className="link start-today"
            onClick={() => { setForm((f) => ({ ...f, startDate: todayISO() })); setErrors([]); }}
          >
            Renewing today? Set to today
          </button>
        </label>
        <label>
          Expiry date
          <input value={expiry ? formatDate(expiry) : '—'} readOnly className="readonly" tabIndex={-1} />
        </label>
      </div>

      <label>
        Name
        <input value={form.name} onChange={set('name')} />
      </label>

      <label>
        Phone
        <input value={form.phone} onChange={set('phone')} inputMode="tel" />
        {form.phone && (
          <small className={duplicate || !cleanPhone ? 'hint bad' : 'hint good'}>
            {duplicate
              ? `Already registered to ${duplicate.name} (${duplicate.id})`
              : cleanPhone ? formatPhone(cleanPhone) : 'Enter a 10-digit mobile number'}
          </small>
        )}
      </label>

      <BodyStatsFields form={form} set={set} />

      <label className="check">
        <input type="checkbox" checked={form.whatsappConsent} onChange={set('whatsappConsent')} />
        Member agrees to receive WhatsApp messages
      </label>

      <div className="form-actions">
        <button type="submit" className="primary" disabled={Boolean(duplicate) || busy}>
          {busy ? 'Saving…' : changed ? 'Save upgrade' : 'Save changes'}
        </button>
        <button type="button" className="secondary" onClick={onCancel} disabled={busy}>Cancel</button>
      </div>
    </form>
  );
}
