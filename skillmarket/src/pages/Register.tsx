import { useId, useState, type FormEvent } from 'react';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { errorMessage, fieldErrors } from '../components/errors';
import { ErrorNotice, FieldError } from '../components/ui';
import { buttonClass, inputClass } from '../components/styles';
import { useApp } from '../context/useApp';
import { validateSignUp } from '../lib/validation';

export default function Register() {
  const { user, signUp } = useApp();
  const navigate = useNavigate();
  const uid = useId();
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState('');
  const [confirmEmail, setConfirmEmail] = useState(false);
  const [busy, setBusy] = useState(false);

  if (user && !confirmEmail) return <Navigate to="/dashboard" replace />;

  async function submit(e: FormEvent) {
    e.preventDefault();
    const problems = validateSignUp(email, password, fullName);
    setErrors(problems);
    setFormError('');
    if (Object.keys(problems).length > 0) return;
    setBusy(true);
    try {
      const result = await signUp(email, password, fullName);
      if (result.needsConfirmation) setConfirmEmail(true);
      else { toast.success('Account created. Welcome to SkillMarket!'); navigate('/dashboard', { replace: true }); }
    } catch (err) {
      setErrors(fieldErrors(err));
      setFormError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  if (confirmEmail) {
    return (
      <div className="mx-auto max-w-md rounded-2xl border border-slate-200 bg-white p-6">
        <h1 className="text-2xl font-extrabold">Check your email</h1>
        <p className="mt-2 text-slate-600">We sent a confirmation link to <strong>{email}</strong>. Open it, then <Link to="/login" className="font-semibold text-brand-700 hover:underline">sign in</Link>.</p>
      </div>
    );
  }

  const field = (name: string) => ({ 'aria-invalid': errors[name] ? true : undefined, 'aria-describedby': errors[name] ? `${uid}-${name}-err` : undefined });
  return (
    <div className="mx-auto max-w-md">
      <h1 className="text-3xl font-extrabold">Join SkillMarket</h1>
      <p className="mt-1 text-slate-600">Already a member? <Link to="/login" className="font-semibold text-brand-700 hover:underline">Sign in</Link>.</p>
      <form onSubmit={submit} noValidate className="mt-6 space-y-4 rounded-2xl border border-slate-200 bg-white p-6">
        <div>
          <label htmlFor={`${uid}-n`} className="text-sm font-semibold">Full name</label>
          <input id={`${uid}-n`} autoComplete="name" value={fullName} onChange={(e) => setFullName(e.target.value)} {...field('full_name')} className={inputClass(!!errors.full_name)} />
          <FieldError id={`${uid}-full_name-err`} message={errors.full_name} />
        </div>
        <div>
          <label htmlFor={`${uid}-e`} className="text-sm font-semibold">Email</label>
          <input id={`${uid}-e`} type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} {...field('email')} className={inputClass(!!errors.email)} />
          <FieldError id={`${uid}-email-err`} message={errors.email} />
        </div>
        <div>
          <label htmlFor={`${uid}-p`} className="text-sm font-semibold">Password</label>
          <input id={`${uid}-p`} type="password" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} {...field('password')} className={inputClass(!!errors.password)} />
          <FieldError id={`${uid}-password-err`} message={errors.password} />
          <p className="mt-1 text-xs text-slate-500">At least 8 characters.</p>
        </div>
        {formError && Object.keys(errors).length === 0 && <ErrorNotice message={formError} />}
        <button type="submit" disabled={busy} className={`${buttonClass()} w-full`}>{busy ? 'Creating account…' : 'Create account'}</button>
      </form>
    </div>
  );
}
