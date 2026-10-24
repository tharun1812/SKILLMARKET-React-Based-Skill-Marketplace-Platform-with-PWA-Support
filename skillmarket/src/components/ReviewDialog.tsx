import { Star } from 'lucide-react';
import { useId, useState, type FormEvent } from 'react';
import toast from 'react-hot-toast';
import { useApp } from '../context/useApp';
import type { ExchangeRequest } from '../lib/types';
import { errorMessage } from './errors';
import Modal from './Modal';
import { ErrorNotice } from './ui';
import { buttonClass, inputClass } from './styles';

interface Props {
  request: ExchangeRequest;
  open: boolean;
  onClose: () => void;
  onDone: () => void;
}

export default function ReviewDialog({ request, open, onClose, onDone }: Props) {
  const { service, user } = useApp();
  const uid = useId();
  const [rating, setRating] = useState(0);
  const [comment, setComment] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const other = request.requester_id === user?.id ? request.owner_name : request.requester_name;

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (rating < 1) { setError('Choose a rating from 1 to 5 stars.'); return; }
    setBusy(true);
    setError('');
    try {
      await service.createReview({ request_id: request.id, rating, comment });
      toast.success('Thanks for your review!');
      onDone();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal open={open} onClose={onClose} title={`Review ${other}`}>
      <form onSubmit={submit} noValidate className="space-y-4">
        <fieldset>
          <legend className="text-sm font-semibold text-slate-800">How did “{request.skill_title}” go?</legend>
          <div className="mt-2 flex gap-1" role="radiogroup" aria-label="Rating">
            {[1, 2, 3, 4, 5].map((n) => (
              <button key={n} type="button" role="radio" aria-checked={rating === n} aria-label={`${n} star${n > 1 ? 's' : ''}`} onClick={() => setRating(n)}
                      className="rounded p-1 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500">
                <Star className={`h-8 w-8 ${n <= rating ? 'fill-spark-400 text-spark-400' : 'text-slate-300'}`} aria-hidden="true" />
              </button>
            ))}
          </div>
        </fieldset>
        <div>
          <label htmlFor={`${uid}-c`} className="text-sm font-semibold text-slate-800">Comment (optional)</label>
          <textarea id={`${uid}-c`} rows={3} value={comment} onChange={(e) => setComment(e.target.value)} maxLength={500} className={inputClass()} />
        </div>
        {error && <ErrorNotice message={error} />}
        <div className="flex justify-end gap-3">
          <button type="button" onClick={onClose} className={buttonClass('secondary')}>Cancel</button>
          <button type="submit" disabled={busy} className={buttonClass()}>{busy ? 'Saving…' : 'Submit review'}</button>
        </div>
      </form>
    </Modal>
  );
}
