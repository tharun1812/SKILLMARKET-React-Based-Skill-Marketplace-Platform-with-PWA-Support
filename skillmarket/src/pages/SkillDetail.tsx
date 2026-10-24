import { ArrowLeft, Clock, MapPin } from 'lucide-react';
import { useCallback, useState } from 'react';
import { Link, useLocation, useParams } from 'react-router-dom';
import RequestDialog from '../components/RequestDialog';
import { Avatar, EmptyState, ErrorNotice, Spinner, StarRating } from '../components/ui';
import { buttonClass } from '../components/styles';
import { useApp } from '../context/useApp';
import { LEVELS, MODES } from '../lib/constants';
import { timeAgo } from '../lib/format';
import { useLoad } from '../lib/useLoad';

export default function SkillDetail() {
  const { id = '' } = useParams();
  const { service, user } = useApp();
  const location = useLocation();
  const [open, setOpen] = useState(false);
  const [sent, setSent] = useState(false);

  const load = useCallback(async () => {
    const skill = await service.getSkill(id);
    const reviews = await service.listReviewsFor(skill.owner_id);
    return { skill, reviews };
  }, [service, id]);
  const { data, error, loading, reload } = useLoad(load);

  if (loading && !data) return <Spinner />;
  if (error || !data) return <div className="space-y-4"><ErrorNotice message={error || 'Skill not found.'} onRetry={reload} /><Link to="/marketplace" className="text-brand-700 hover:underline">Back to marketplace</Link></div>;

  const { skill, reviews } = data;
  const mine = user?.id === skill.owner_id;
  return (
    <div className="space-y-8">
      <Link to="/marketplace" className="inline-flex items-center gap-1 text-sm font-semibold text-brand-700 hover:underline"><ArrowLeft className="h-4 w-4" aria-hidden="true" />Marketplace</Link>
      <div className="grid gap-8 lg:grid-cols-[1fr_320px]">
        <article className="rounded-2xl border border-slate-200 bg-white p-6">
          <span className={`rounded-full px-2.5 py-0.5 text-xs font-bold ${skill.kind === 'offer' ? 'bg-brand-100 text-brand-800' : 'bg-spark-100 text-spark-800'}`}>{skill.kind === 'offer' ? 'Offering' : 'Looking for'}</span>
          <h1 className="mt-3 text-3xl font-extrabold">{skill.title}</h1>
          <p className="mt-1 text-sm text-slate-500">Posted {timeAgo(skill.created_at)}</p>
          <p className="mt-4 whitespace-pre-line text-slate-700">{skill.description}</p>
          <ul className="mt-5 flex flex-wrap gap-2 text-sm">
            <li className="rounded-md bg-slate-100 px-2.5 py-1">{skill.category}</li>
            <li className="rounded-md bg-slate-100 px-2.5 py-1">{LEVELS.find((l) => l.value === skill.level)?.label}</li>
            <li className="inline-flex items-center gap-1 rounded-md bg-slate-100 px-2.5 py-1"><MapPin className="h-3.5 w-3.5" aria-hidden="true" />{MODES.find((m) => m.value === skill.mode)?.label}</li>
            {skill.hours_estimate !== null && <li className="inline-flex items-center gap-1 rounded-md bg-slate-100 px-2.5 py-1"><Clock className="h-3.5 w-3.5" aria-hidden="true" />About {skill.hours_estimate} hours</li>}
            {skill.tags.map((t) => <li key={t} className="rounded-md bg-brand-50 px-2.5 py-1 text-brand-800">#{t}</li>)}
          </ul>
          <div className="mt-6">
            {mine ? <Link to="/my-skills" className={buttonClass('secondary')}>Manage in My skills</Link>
              : user ? <button type="button" onClick={() => setOpen(true)} disabled={sent} className={buttonClass()}>{sent ? 'Request sent' : skill.kind === 'offer' ? 'Request this skill' : 'Offer to help'}</button>
              : <Link to="/login" state={{ from: location.pathname }} className={buttonClass()}>Sign in to send a request</Link>}
          </div>
        </article>

        <aside className="space-y-4">
          <div className="rounded-2xl border border-slate-200 bg-white p-5">
            <div className="flex items-center gap-3">
              <Avatar name={skill.owner.full_name} />
              <div className="min-w-0">
                <Link to={`/u/${skill.owner.id}`} className="block truncate font-bold hover:underline">{skill.owner.full_name}</Link>
                <p className="truncate text-sm text-slate-500">{skill.owner.university || 'Student'}</p>
              </div>
            </div>
            <div className="mt-3"><StarRating value={skill.owner.avg_rating} count={skill.owner.review_count} /></div>
          </div>
          <div className="rounded-2xl border border-slate-200 bg-white p-5">
            <h2 className="font-bold">Reviews</h2>
            {reviews.length === 0 ? <p className="mt-2 text-sm text-slate-500">No reviews yet.</p> : (
              <ul className="mt-3 space-y-3">{reviews.slice(0, 4).map((r) => (
                <li key={r.id} className="text-sm"><p className="flex items-center gap-2"><strong>{r.reviewer_name}</strong><StarRating value={r.rating} /></p>{r.comment && <p className="text-slate-600">{r.comment}</p>}</li>
              ))}</ul>
            )}
          </div>
        </aside>
      </div>
      <RequestDialog skill={skill} open={open} onClose={() => setOpen(false)} onSent={() => { setOpen(false); setSent(true); }} />
      {sent && <EmptyState title="Request sent">Track it in <Link to="/requests" className="font-semibold text-brand-700 hover:underline">Requests</Link>.</EmptyState>}
    </div>
  );
}
