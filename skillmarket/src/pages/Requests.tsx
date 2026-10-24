import { useCallback, useState } from 'react';
import toast from 'react-hot-toast';
import { Link } from 'react-router-dom';
import { errorMessage } from '../components/errors';
import ReviewDialog from '../components/ReviewDialog';
import { Avatar, EmptyState, ErrorNotice, Spinner, StatusBadge } from '../components/ui';
import { buttonClass } from '../components/styles';
import { useApp } from '../context/useApp';
import { timeAgo } from '../lib/format';
import { availableActions } from '../lib/rules';
import type { ExchangeRequest, RequestStatus } from '../lib/types';
import { useLoad } from '../lib/useLoad';

const ACTION_LABEL: Record<RequestStatus, string> = {
  accepted: 'Accept', declined: 'Decline', cancelled: 'Cancel', completed: 'Mark completed', pending: 'Pending',
};

export default function Requests() {
  const { service, user } = useApp();
  const [tab, setTab] = useState<'incoming' | 'outgoing'>('incoming');
  const [reviewing, setReviewing] = useState<ExchangeRequest | null>(null);
  const [busyId, setBusyId] = useState('');

  const load = useCallback(() => service.listRequests(), [service]);
  const { data, error, loading, reload } = useLoad(load);

  async function act(r: ExchangeRequest, status: RequestStatus) {
    setBusyId(r.id);
    try {
      await service.setRequestStatus(r.id, status);
      toast.success(`Request ${status}`);
      reload();
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setBusyId('');
    }
  }

  const list = data ? data[tab] : [];
  const pendingIncoming = data?.incoming.filter((r) => r.status === 'pending').length ?? 0;
  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-3xl font-extrabold">Requests</h1>
        <p className="text-slate-600">Swap requests you received and the ones you sent.</p>
      </header>

      <div role="tablist" aria-label="Request type" className="inline-flex rounded-xl bg-slate-100 p-1">
        {(['incoming', 'outgoing'] as const).map((t) => (
          <button key={t} role="tab" type="button" aria-selected={tab === t} onClick={() => setTab(t)}
                  className={`rounded-lg px-4 py-1.5 text-sm font-semibold capitalize ${tab === t ? 'bg-white shadow text-brand-800' : 'text-slate-600'}`}>
            {t === 'incoming' ? `Received${pendingIncoming ? ` (${pendingIncoming})` : ''}` : 'Sent'}
          </button>
        ))}
      </div>

      {loading && !data && <Spinner />}
      {error && <ErrorNotice message={error} onRetry={reload} />}
      {data && list.length === 0 && (
        <EmptyState title={tab === 'incoming' ? 'No requests received yet' : 'You have not sent any requests'}>
          {tab === 'outgoing' ? <>Find something to learn in the <Link to="/marketplace" className="font-semibold text-brand-700 hover:underline">marketplace</Link>.</> : 'When someone asks for one of your skills, it will show up here.'}
        </EmptyState>
      )}
      {data && list.length > 0 && (
        <ul className="space-y-4">
          {list.map((r) => {
            const other = tab === 'incoming' ? r.requester_name : r.owner_name;
            const actions = user ? availableActions(r, user.id) : [];
            return (
              <li key={r.id} className="rounded-2xl border border-slate-200 bg-white p-5">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <Avatar name={other} />
                    <div>
                      <p className="font-bold">{other}</p>
                      <p className="text-sm text-slate-500">{tab === 'incoming' ? 'asked for' : 'you asked for'} <Link to={`/skills/${r.skill_id}`} className="font-semibold text-slate-700 hover:underline">{r.skill_title}</Link> · {timeAgo(r.created_at)}</p>
                    </div>
                  </div>
                  <StatusBadge status={r.status} />
                </div>
                <p className="mt-3 rounded-lg bg-slate-50 p-3 text-slate-700">“{r.message}”</p>
                {r.offered_in_return && <p className="mt-2 text-sm text-slate-600"><strong>Offered in return:</strong> {r.offered_in_return}</p>}
                <div className="mt-4 flex flex-wrap gap-2">
                  {actions.map((a) => (
                    <button key={a} type="button" disabled={busyId === r.id} onClick={() => act(r, a)}
                            className={buttonClass(a === 'accepted' || a === 'completed' ? 'primary' : 'secondary')}>{ACTION_LABEL[a]}</button>
                  ))}
                  {r.status === 'completed' && !r.reviewed_by_me && <button type="button" onClick={() => setReviewing(r)} className={buttonClass('secondary')}>Leave a review</button>}
                  {r.status === 'completed' && r.reviewed_by_me && <span className="self-center text-sm text-slate-500">You reviewed this exchange</span>}
                </div>
              </li>
            );
          })}
        </ul>
      )}
      {reviewing && <ReviewDialog request={reviewing} open onClose={() => setReviewing(null)} onDone={() => { setReviewing(null); reload(); }} />}
    </div>
  );
}
