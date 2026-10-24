import { ArrowRight, Handshake, Search, Star } from 'lucide-react';
import { useCallback } from 'react';
import { Link } from 'react-router-dom';
import SkillCard from '../components/SkillCard';
import { ErrorNotice, Spinner } from '../components/ui';
import { buttonClass } from '../components/styles';
import { useApp } from '../context/useApp';
import { DEMO_PASSWORD } from '../lib/localService';
import { useLoad } from '../lib/useLoad';

const STEPS = [
  { icon: Search, title: 'Post what you know', text: 'List a skill you can teach, or one you want to learn. It takes a minute.' },
  { icon: Handshake, title: 'Swap with a student', text: 'Send a request, agree on a time, and trade lessons instead of money.' },
  { icon: Star, title: 'Review and grow', text: 'Rate each exchange so great teachers and learners are easy to find.' },
];

export default function Landing() {
  const { service, user } = useApp();
  const load = useCallback(async () => (await service.listSkills({ sort: 'newest' })).slice(0, 6), [service]);
  const { data, error, loading, reload } = useLoad(load);

  return (
    <div className="space-y-16">
      <section className="grid items-center gap-8 md:grid-cols-[1.2fr_1fr]">
        <div>
          <p className="text-sm font-bold uppercase tracking-wide text-brand-700">For students, by students</p>
          <h1 className="mt-2 text-4xl font-extrabold leading-tight text-slate-900 sm:text-5xl">Trade skills, not money.</h1>
          <p className="mt-4 max-w-xl text-lg text-slate-600">
            Teach the thing you are good at, learn the thing you are not. SkillMarket connects students who want to swap lessons,
            from Python to guitar to Spanish.
          </p>
          <div className="mt-6 flex flex-wrap gap-3">
            <Link to="/marketplace" className={buttonClass()}>Browse skills <ArrowRight className="h-4 w-4" aria-hidden="true" /></Link>
            {!user && <Link to="/register" className={buttonClass('secondary')}>Create a free account</Link>}
          </div>
          {service.mode === 'local' && !user && (
            <p className="mt-4 rounded-lg bg-spark-100 px-3 py-2 text-sm text-spark-800">
              Demo mode: data stays in this browser. Sign in with <strong>ana@demo.edu</strong> and password <strong>{DEMO_PASSWORD}</strong>.
            </p>
          )}
        </div>
        <ol className="space-y-3">
          {STEPS.map(({ icon: Icon, title, text }, i) => (
            <li key={title} className="flex gap-4 rounded-2xl border border-slate-200 bg-white p-4">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-brand-100 text-brand-800"><Icon className="h-5 w-5" aria-hidden="true" /></span>
              <div><p className="font-bold">{i + 1}. {title}</p><p className="text-sm text-slate-600">{text}</p></div>
            </li>
          ))}
        </ol>
      </section>

      <section aria-labelledby="latest">
        <div className="mb-4 flex items-end justify-between">
          <h2 id="latest" className="text-2xl font-bold">Fresh on the marketplace</h2>
          <Link to="/marketplace" className="text-sm font-semibold text-brand-700 hover:underline">See all</Link>
        </div>
        {loading && <Spinner />}
        {error && <ErrorNotice message={error} onRetry={reload} />}
        {data && <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{data.map((s) => <SkillCard key={s.id} skill={s} />)}</div>}
      </section>
    </div>
  );
}
