import { Pencil, Plus, Trash2 } from 'lucide-react';
import { useCallback, useState } from 'react';
import toast from 'react-hot-toast';
import { Link } from 'react-router-dom';
import { errorMessage } from '../components/errors';
import Modal from '../components/Modal';
import SkillForm from '../components/SkillForm';
import { EmptyState, ErrorNotice, Spinner } from '../components/ui';
import { buttonClass } from '../components/styles';
import { useApp } from '../context/useApp';
import { timeAgo } from '../lib/format';
import type { Skill, SkillInput } from '../lib/types';
import { useLoad } from '../lib/useLoad';

export default function MySkills() {
  const { service, user } = useApp();
  const [editing, setEditing] = useState<Skill | 'new' | null>(null);
  const [deleting, setDeleting] = useState<Skill | null>(null);

  const userId = user?.id ?? '';
  const load = useCallback(() => service.listSkills({ ownerId: userId }), [service, userId]);
  const { data, error, loading, reload } = useLoad(load);

  async function save(input: SkillInput) {
    if (editing && editing !== 'new') await service.updateSkill(editing.id, input);
    else await service.createSkill(input);
    toast.success(editing === 'new' ? 'Skill posted' : 'Skill updated');
    setEditing(null);
    reload();
  }

  async function remove() {
    if (!deleting) return;
    try {
      await service.deleteSkill(deleting.id);
      toast.success('Skill deleted');
      setDeleting(null);
      reload();
    } catch (e) {
      toast.error(errorMessage(e));
    }
  }

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-3xl font-extrabold">My skills</h1>
          <p className="text-slate-600">What you can teach, and what you want to learn.</p>
        </div>
        <button type="button" onClick={() => setEditing('new')} className={buttonClass()}><Plus className="h-4 w-4" aria-hidden="true" />Add a skill</button>
      </header>

      {loading && !data && <Spinner />}
      {error && <ErrorNotice message={error} onRetry={reload} />}
      {data && data.length === 0 && <EmptyState title="You have not posted anything yet">Add a skill you can teach, or one you want to learn, to start swapping.</EmptyState>}
      {data && data.length > 0 && (
        <ul className="space-y-3">
          {data.map((s) => (
            <li key={s.id} className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white p-4">
              <div className="min-w-0">
                <span className={`rounded-full px-2 py-0.5 text-xs font-bold ${s.kind === 'offer' ? 'bg-brand-100 text-brand-800' : 'bg-spark-100 text-spark-800'}`}>{s.kind === 'offer' ? 'Offering' : 'Looking for'}</span>
                <p className="mt-1 truncate font-bold"><Link to={`/skills/${s.id}`} className="hover:underline">{s.title}</Link></p>
                <p className="text-sm text-slate-500">{s.category} · posted {timeAgo(s.created_at)}</p>
              </div>
              <div className="flex gap-2">
                <button type="button" onClick={() => setEditing(s)} className={buttonClass('secondary')} aria-label={`Edit ${s.title}`}><Pencil className="h-4 w-4" aria-hidden="true" />Edit</button>
                <button type="button" onClick={() => setDeleting(s)} className={buttonClass('secondary')} aria-label={`Delete ${s.title}`}><Trash2 className="h-4 w-4" aria-hidden="true" />Delete</button>
              </div>
            </li>
          ))}
        </ul>
      )}

      <Modal open={editing !== null} onClose={() => setEditing(null)} title={editing === 'new' ? 'Post a skill' : 'Edit skill'}>
        {editing !== null && <SkillForm initial={editing === 'new' ? undefined : editing} onSubmit={save} onCancel={() => setEditing(null)} />}
      </Modal>
      <Modal open={deleting !== null} onClose={() => setDeleting(null)} title="Delete this skill?">
        <p className="text-slate-600">“{deleting?.title}” and any requests for it will be removed. This cannot be undone.</p>
        <div className="mt-5 flex justify-end gap-3">
          <button type="button" onClick={() => setDeleting(null)} className={buttonClass('secondary')}>Keep it</button>
          <button type="button" onClick={remove} className={buttonClass('danger')}>Delete skill</button>
        </div>
      </Modal>
    </div>
  );
}
