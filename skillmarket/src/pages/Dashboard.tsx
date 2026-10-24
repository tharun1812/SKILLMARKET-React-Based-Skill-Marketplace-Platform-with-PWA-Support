import { ArrowRight, CheckCircle2, Hourglass, Inbox, Layers } from 'lucide-react';
import { useCallback } from 'react';
import { Link } from 'react-router-dom';
import { ErrorNotice, Spinner, StatusBadge } from '../components/ui';
import { buttonClass } from '../components/styles';
import { useApp } from '../context/useApp';
import { timeAgo } from '../lib/format';
import { computeStats } from '../lib/rules';
import { useLoad } from '../lib/useLoad';

export default function Dashboard() {
  const { service, user, profile } = useApp();
  const userId = user?.id ?? '';
  const load = useCallback(async () => {
    const [mine, requests] = await Promise.all([service.listSkills({ ownerId: userId }), service.listRequests()]);
    return { mine, ...requests };
  }, [service, userId]);
  const { data, error, loading, reload } = useLoad(load);

  if (loading && !data) return <Spinner />;
  if (error || !data) return <ErrorNotice message={error || 'Could not load your dashboard.'} onRetry={reload} />;

  const stats = computeStats(data.mine, data.incoming, data.outgoing);
  const recent = [...data.incoming, ...data.outgoing].sort((a, b) => b.updated_at.localeCompare(a.updated_at)).slice(0, 5);
  const cards = [
    { label: 'Skills offered', value: stats.offers, icon: Layers, to: '/my-skills' },
    { label: 'Requests to answer', value: stats.incomingPending, icon: Inbox, to: '/requests' },
    { label: 'Active exchanges', value: stats.active, icon: Hourglass, to: '/requests' },
    { label: 'Completed', value: stats.completed, icon: CheckCircle2, to: '/requests' },
  ];

  return (
    <div className="space-y-8">
      <header>
        <h1 className="text-3xl font-extrabold">Hi, {profile?.full_name.split(' ')[0] || 'there'}</h1>
        <p className="text-slate-600">Here is what is happening with your swaps.</p>
      </header>

      <ul className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        {cards.map(({ label, value, icon: Icon, to }) => (
          <li key={label}>
            <Link to={to} className="block h-full rounded-2xl border border-slate-200 bg-white p-5 hover:border-brand-500">
              <Icon className="h-5 w-5 text-brand-700" aria-hidden="true" />
              <p className="mt-3 text-3xl font-extrabold">{value}</p>
              <p className="text-sm text-slate-600">{label}</p>
            </Link>
          </li>
        ))}
      </ul>

      {stats.incomingPending > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-spark-100 p-4 text-spark-800">
          <p className="font-semibold">{stats.incomingPending} student{stats.incomingPending === 1 ? ' is' : 's are'} waiting for your answer.</p>
          <Link to="/requests" className={buttonClass()}>Review requests</Link>
        </div>
      )}

      <section aria-labelledby="recent" className="rounded-2xl border border-slate-200 bg-white p-5">
        <h2 id="recent" className="text-lg font-bold">Recent activity</h2>
        {recent.length === 0 ? (
          <p className="mt-2 text-slate-600">Nothing yet. <Link to="/marketplace" className="font-semibold text-brand-700 hover:underline">Browse the marketplace</Link> to send your first request.</p>
        ) : (
          <ul className="mt-3 divide-y divide-slate-100">
            {recent.map((r) => (
              <li key={r.id} className="flex flex-wrap items-center justify-between gap-2 py-3 text-sm">
                <span><strong>{r.requester_id === userId ? 'You' : r.requester_name}</strong> requested <strong>{r.skill_title}</strong> · {timeAgo(r.updated_at)}</span>
                <StatusBadge status={r.status} />
              </li>
            ))}
          </ul>
        )}
      </section>
      <Link to="/marketplace" className={buttonClass('secondary')}>Find something to learn <ArrowRight className="h-4 w-4" aria-hidden="true" /></Link>
    </div>
  );
}
