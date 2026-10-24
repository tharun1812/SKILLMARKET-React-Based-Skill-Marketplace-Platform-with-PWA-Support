import { useId, useState, type FormEvent } from 'react';
import { CATEGORIES, LEVELS, MODES } from '../lib/constants';
import type { Skill, SkillInput, SkillKind, SkillLevel, SkillMode } from '../lib/types';
import { parseTags, validateSkill } from '../lib/validation';
import { errorMessage, fieldErrors } from './errors';
import { ErrorNotice, FieldError } from './ui';
import { buttonClass, inputClass } from './styles';

interface Props {
  initial?: Skill;
  onSubmit: (input: SkillInput) => Promise<void>;
  onCancel: () => void;
}

export default function SkillForm({ initial, onSubmit, onCancel }: Props) {
  const uid = useId();
  const [kind, setKind] = useState<SkillKind>(initial?.kind ?? 'offer');
  const [title, setTitle] = useState(initial?.title ?? '');
  const [description, setDescription] = useState(initial?.description ?? '');
  const [category, setCategory] = useState<string>(initial?.category ?? CATEGORIES[0]);
  const [level, setLevel] = useState<SkillLevel>(initial?.level ?? 'beginner');
  const [mode, setMode] = useState<SkillMode>(initial?.mode ?? 'online');
  const [hours, setHours] = useState(initial?.hours_estimate?.toString() ?? '');
  const [tags, setTags] = useState(initial?.tags.join(', ') ?? '');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    const input: SkillInput = {
      title, description, category, level, mode, kind, tags: parseTags(tags),
      hours_estimate: hours.trim() === '' ? null : Number(hours),
    };
    const problems = validateSkill({ ...input, title: title.trim(), description: description.trim() });
    setErrors(problems);
    setFormError('');
    if (Object.keys(problems).length > 0) return;
    setBusy(true);
    try {
      await onSubmit(input);
    } catch (err) {
      setErrors(fieldErrors(err));
      setFormError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  const field = (name: string) => ({ id: `${uid}-${name}`, 'aria-invalid': errors[name] ? true : undefined, 'aria-describedby': errors[name] ? `${uid}-${name}-err` : undefined });

  return (
    <form onSubmit={submit} noValidate className="space-y-4">
      <fieldset>
        <legend className="text-sm font-semibold text-slate-800">I want to</legend>
        <div className="mt-1 grid grid-cols-2 gap-2">
          {(['offer', 'want'] as const).map((k) => (
            <label key={k} className={`cursor-pointer rounded-lg border px-3 py-2 text-center text-sm font-semibold ${kind === k ? 'border-brand-600 bg-brand-50 text-brand-800' : 'border-slate-300 text-slate-700'}`}>
              <input type="radio" name={`${uid}-kind`} value={k} checked={kind === k} onChange={() => setKind(k)} className="sr-only" />
              {k === 'offer' ? 'Teach a skill' : 'Learn a skill'}
            </label>
          ))}
        </div>
      </fieldset>

      <div>
        <label htmlFor={`${uid}-title`} className="text-sm font-semibold text-slate-800">Title</label>
        <input {...field('title')} value={title} onChange={(e) => setTitle(e.target.value)} maxLength={80} placeholder="e.g. Python for beginners" className={inputClass(!!errors.title)} />
        <FieldError id={`${uid}-title-err`} message={errors.title} />
      </div>
      <div>
        <label htmlFor={`${uid}-description`} className="text-sm font-semibold text-slate-800">Description</label>
        <textarea {...field('description')} value={description} onChange={(e) => setDescription(e.target.value)} rows={4} maxLength={1000} placeholder="What will you cover, and how?" className={inputClass(!!errors.description)} />
        <FieldError id={`${uid}-description-err`} message={errors.description} />
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor={`${uid}-category`} className="text-sm font-semibold text-slate-800">Category</label>
          <select {...field('category')} value={category} onChange={(e) => setCategory(e.target.value)} className={inputClass(!!errors.category)}>
            {CATEGORIES.map((c) => <option key={c}>{c}</option>)}
          </select>
        </div>
        <div>
          <label htmlFor={`${uid}-level`} className="text-sm font-semibold text-slate-800">Level</label>
          <select {...field('level')} value={level} onChange={(e) => setLevel(e.target.value as SkillLevel)} className={inputClass()}>
            {LEVELS.map((l) => <option key={l.value} value={l.value}>{l.label}</option>)}
          </select>
        </div>
        <div>
          <label htmlFor={`${uid}-mode`} className="text-sm font-semibold text-slate-800">How we meet</label>
          <select {...field('mode')} value={mode} onChange={(e) => setMode(e.target.value as SkillMode)} className={inputClass()}>
            {MODES.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
          </select>
        </div>
        <div>
          <label htmlFor={`${uid}-hours`} className="text-sm font-semibold text-slate-800">Estimated hours (optional)</label>
          <input {...field('hours_estimate')} id={`${uid}-hours`} inputMode="numeric" value={hours} onChange={(e) => setHours(e.target.value)} placeholder="4" className={inputClass(!!errors.hours_estimate)} />
          <FieldError id={`${uid}-hours_estimate-err`} message={errors.hours_estimate} />
        </div>
      </div>
      <div>
        <label htmlFor={`${uid}-tags`} className="text-sm font-semibold text-slate-800">Tags (comma separated, up to 5)</label>
        <input {...field('tags')} value={tags} onChange={(e) => setTags(e.target.value)} placeholder="python, coding" className={inputClass(!!errors.tags)} />
        <FieldError id={`${uid}-tags-err`} message={errors.tags} />
      </div>

      {formError && Object.keys(errors).length === 0 && <ErrorNotice message={formError} />}
      <div className="flex justify-end gap-3 pt-2">
        <button type="button" onClick={onCancel} className={buttonClass('secondary')}>Cancel</button>
        <button type="submit" disabled={busy} className={buttonClass()}>{busy ? 'Saving…' : initial ? 'Save changes' : 'Post skill'}</button>
      </div>
    </form>
  );
}
