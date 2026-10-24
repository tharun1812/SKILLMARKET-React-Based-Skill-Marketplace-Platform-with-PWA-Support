import { useId, useState, type FormEvent } from 'react';
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { errorMessage } from '../components/errors';
import { ErrorNotice } from '../components/ui';
import { buttonClass, inputClass } from '../components/styles';
import { useApp } from '../context/useApp';
import { DEMO_PASSWORD } from '../lib/localService';

export default function Login() {
  const { user, signIn, service } = useApp();
  const navigate = useNavigate();
  const location = useLocation();
  const uid = useId();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const from = (location.state as { from?: string } | null)?.from ?? '/dashboard';

  if (user) return <Navigate to={from} replace />;

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      await signIn(email, password);
      toast.success('Welcome back!');
      navigate(from, { replace: true });
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto max-w-md">
      <h1 className="text-3xl font-extrabold">Sign in</h1>
      <p className="mt-1 text-slate-600">Welcome back. New here? <Link to="/register" className="font-semibold text-brand-700 hover:underline">Create an account</Link>.</p>
      <form onSubmit={submit} className="mt-6 space-y-4 rounded-2xl border border-slate-200 bg-white p-6">
        <div>
          <label htmlFor={`${uid}-e`} className="text-sm font-semibold">Email</label>
          <input id={`${uid}-e`} type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} className={inputClass()} />
        </div>
        <div>
          <label htmlFor={`${uid}-p`} className="text-sm font-semibold">Password</label>
          <input id={`${uid}-p`} type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} className={inputClass()} />
        </div>
        {error && <ErrorNotice message={error} />}
        <button type="submit" disabled={busy} className={`${buttonClass()} w-full`}>{busy ? 'Signing in…' : 'Sign in'}</button>
        {service.mode === 'local' && (
          <button type="button" className={`${buttonClass('secondary')} w-full`} onClick={() => { setEmail('ana@demo.edu'); setPassword(DEMO_PASSWORD); }}>
            Fill in the demo account
          </button>
        )}
      </form>
    </div>
  );
}
