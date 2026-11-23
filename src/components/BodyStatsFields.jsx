import {
  ageFromDob, bmiCategory, calculateBmi, parseBodyDetails, todayISO, HEIGHT_RANGE, WEIGHT_RANGE,
} from '../lib/members.js';

// Optional body details: date of birth, weight (kg) and height (cm). With weight and height filled in,
// the BMI is worked out and shown straight away. Used by the Add member and Edit member forms.
export default function BodyStatsFields({ form, set }) {
  const body = parseBodyDetails(form);
  const bmi = body.errors.length === 0 ? calculateBmi(body.weightKg, body.heightCm) : null;
  const category = bmiCategory(bmi);
  const age = body.dateOfBirth ? ageFromDob(body.dateOfBirth) : null;

  return (
    <>
      <div className="row body-row">
        <label>
          Date of birth <span className="hint muted">(optional)</span>
          <input type="date" value={form.dateOfBirth} onChange={set('dateOfBirth')} max={todayISO()} />
          {age !== null && <small className="hint muted">Age {age}</small>}
        </label>
        <label>
          Weight (kg) <span className="hint muted">(optional)</span>
          <input
            value={form.weightKg}
            onChange={set('weightKg')}
            inputMode="decimal"
            placeholder="e.g. 70"
            autoComplete="off"
          />
        </label>
        <label>
          Height (cm) <span className="hint muted">(optional)</span>
          <input
            value={form.heightCm}
            onChange={set('heightCm')}
            inputMode="decimal"
            placeholder="e.g. 170"
            autoComplete="off"
          />
        </label>
      </div>

      {body.errors.length > 0 && (
        <small className="hint bad">
          {body.errors[0]}
          {body.errors[0].startsWith('Height') ? ` (type it in centimetres, e.g. 170)` : ''}
        </small>
      )}
      {bmi !== null && (
        <div className="bmi-preview" aria-live="polite">
          BMI <b>{bmi}</b> <span className={`badge bmi-${category.key}`}>{category.label}</span>
        </div>
      )}
      {!bmi && !body.errors.length && (form.weightKg || form.heightCm) && !(form.weightKg && form.heightCm) && (
        <small className="hint muted">
          Add both weight ({WEIGHT_RANGE.min}–{WEIGHT_RANGE.max} kg) and height ({HEIGHT_RANGE.min}–{HEIGHT_RANGE.max} cm) to see the BMI.
        </small>
      )}
    </>
  );
}
