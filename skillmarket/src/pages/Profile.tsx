import { useCallback, useEffect, useId, useState, type FormEvent } from 'react';
import toast from 'react-hot-toast';
import { useNavigate, useParams } from 'react-router-dom';
import SkillCard from '../components/SkillCard';
import { errorMessage, fieldErrors } from '../components/errors';
import { Avatar, ErrorNotice, FieldError, Spinner, StarRating } from '../components/ui';
import { buttonClass, inputClass } from '../components/styles';
import { useApp } from '../context/useApp';
import { LocalService } from '../lib/localService';
import { timeAgo } from '../lib/format';
import { useLoad } from '../lib/useLoad';
import { validateProfile } from '../lib/validation';

/** /profile shows and edits your own profile; /u/:id shows someone else's. */
export default function Profile() {
  const { id } = useParams();
  const { service, user, refreshProfile } = useApp();
  const navigate = useNavigate();
  const uid = useId();
  const targetId = id ?? user?.id ?? '';
  const own = targetId === user?.id;

  const load = useCallback(async () => {
    const [profile, reviews, skills] = await Promise.all([service.getProfile(targetId), service.listReviewsFor(targetId), service.listSkills({ ownerId: targetId })]);
    return { profile, reviews, skills };
  }, [service, targetId]);
  const { data, error, loading, reload } = useLoad(load);

  const [fullName, setFullName] = useState('');
  const [university, setUniversity] = useState('');
  const [bio, setBio] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (data) { setFullName(data.profile.full_name); setUniversity(data.profile.university); setBio(data.profile.bio); }
  }, [data]);

  async function save(e: FormEvent) {
    e.preventDefault();
    const patch = { full_name: fullName, university, bio };
    const problems = validateProfile(patch);
    setErrors(problems);
    setFormError('');
    if (Object.keys(problems).length > 0) return;
    setBusy(true);
    try {
      await service.updateProfile(patch);
      await refreshProfile();
      toast.success('Profile saved');
      reload();
    } catch (err) {
      setErrors(fieldErrors(err));
      setFormError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  async function resetDemo() {
    if (service instanceof LocalService) {
      await service.resetDemo();
      toast.success('Demo data restored. Please sign in again.');
      navigate('/login');
    }
  }

  if (loading && !data) return <Spinner />;
  if (error || !data) return <ErrorNotice message={error || 'Profile not found.'} onRetry={reload} />;
  const { profile, reviews, skills } = data;

  return (
    <div className="space-y-8">
      <header className="flex items-center gap-4">
        <Avatar name={profile.full_name} size="lg" />
        <div>
          <h1 className="text-3xl font-extrabold">{profile.full_name}</h1>
          <p className="text-slate-600">{profile.university || 'Student'}</p>
          <StarRating value={profile.avg_rating} count={profile.review_count} />
        </div>
      </header>
      {profile.bio && !own && <p className="max-w-2xl text-slate-700">{profile.bio}</p>}

      {own && (
        <form onSubmit={save} noValidate className="space-y-4 rounded-2xl border border-slate-200 bg-white p-6">
          <h2 className="text-lg font-bold">Edit your profile</h2>
          <div>
            <label htmlFor={`${uid}-n`} className="text-sm font-semibold">Full name</label>
            <input id={`${uid}-n`} value={fullName} onChange={(e) => setFullName(e.target.value)} className={inputClass(!!errors.full_name)} />
            <FieldError id={`${uid}-n-err`} message={errors.full_name} />
          </div>
          <div>
            <label htmlFor={`${uid}-u`} className="text-sm font-semibold">University</label>
            <input id={`${uid}-u`} value={university} onChange={(e) => setUniversity(e.target.value)} className={inputClass(!!errors.university)} />
            <FieldError id={`${uid}-u-err`} message={errors.university} />
          </div>
          <div>
            <label htmlFor={`${uid}-b`} className="text-sm font-semibold">About you</label>
            <textarea id={`${uid}-b`} rows={3} value={bio} onChange={(e) => setBio(e.target.value)} className={inputClass(!!errors.bio)} />
            <FieldError id={`${uid}-b-err`} message={errors.bio} />
          </div>
          {formError && Object.keys(errors).length === 0 && <ErrorNotice message={formError} />}
          <button type="submit" disabled={busy} className={buttonClass()}>{busy ? 'Saving…' : 'Save profile'}</button>
        </form>
      )}

      <section aria-labelledby="skills-h">
        <h2 id="skills-h" className="mb-3 text-lg font-bold">Skills</h2>
        {skills.length === 0 ? <p className="text-slate-600">No skills posted yet.</p> : <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{skills.map((s) => <SkillCard key={s.id} skill={s} />)}</div>}
      </section>

      <section aria-labelledby="reviews-h">
        <h2 id="reviews-h" className="mb-3 text-lg font-bold">Reviews</h2>
        {reviews.length === 0 ? <p className="text-slate-600">No reviews yet.</p> : (
          <ul className="space-y-3">{reviews.map((r) => (
            <li key={r.id} className="rounded-2xl border border-slate-200 bg-white p-4">
              <p className="flex flex-wrap items-center gap-2"><strong>{r.reviewer_name}</strong><StarRating value={r.rating} /><span className="text-sm text-slate-500">{timeAgo(r.created_at)}</span></p>
              {r.comment && <p className="mt-1 text-slate-700">{r.comment}</p>}
            </li>
          ))}</ul>
        )}
      </section>

      {own && service instanceof LocalService && (
        <section className="rounded-2xl border border-slate-200 bg-slate-100 p-5">
          <h2 className="font-bold">Demo mode</h2>
          <p className="mt-1 text-sm text-slate-600">This app is running without a Supabase backend. Everything is stored in this browser only.</p>
          <button type="button" onClick={resetDemo} className={`${buttonClass('secondary')} mt-3`}>Reset demo data</button>
        </section>
      )}
    </div>
  );
}
