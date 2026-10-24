import { useId, useState, type FormEvent } from 'react';
import toast from 'react-hot-toast';
import { useApp } from '../context/useApp';
import type { Skill } from '../lib/types';
import { validateRequest } from '../lib/validation';
import { errorMessage, fieldErrors } from './errors';
import Modal from './Modal';
import { ErrorNotice, FieldError } from './ui';
import { buttonClass, inputClass } from './styles';

interface Props {
  skill: Skill;
  open: boolean;
  onClose: () => void;
  onSent: () => void;
}

export default function RequestDialog({ skill, open, onClose, onSent }: Props) {
  const { service } = useApp();
  const uid = useId();
  const [message, setMessage] = useState('');
  const [offered, setOffered] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    const input = { skill_id: skill.id, message, offered_in_return: offered };
    const problems = validateRequest(input);
    setErrors(problems);
    setFormError('');
    if (Object.keys(problems).length > 0) return;
    setBusy(true);
    try {
      await service.createRequest(input);
      toast.success(`Request sent to ${skill.owner.full_name}`);
      setMessage('');
      setOffered('');
      onSent();
    } catch (err) {
      setErrors(fieldErrors(err));
      setFormError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal open={open} onClose={onClose} title={`Request “${skill.title}”`}>
      <form onSubmit={submit} noValidate className="space-y-4">
        <div>
          <label htmlFor={`${uid}-m`} className="text-sm font-semibold text-slate-800">Message to {skill.owner.full_name}</label>
          <textarea id={`${uid}-m`} rows={4} value={message} onChange={(e) => setMessage(e.target.value)} maxLength={500}
                    aria-invalid={errors.message ? true : undefined} aria-describedby={errors.message ? `${uid}-m-err` : undefined}
                    placeholder="Introduce yourself and say what you hope to learn." className={inputClass(!!errors.message)} />
          <FieldError id={`${uid}-m-err`} message={errors.message} />
        </div>
        <div>
          <label htmlFor={`${uid}-o`} className="text-sm font-semibold text-slate-800">What can you offer in return? (optional)</label>
          <input id={`${uid}-o`} value={offered} onChange={(e) => setOffered(e.target.value)} maxLength={200} placeholder="e.g. Guitar lessons" className={inputClass(!!errors.offered_in_return)} />
          <FieldError id={`${uid}-o-err`} message={errors.offered_in_return} />
        </div>
        {formError && Object.keys(errors).length === 0 && <ErrorNotice message={formError} />}
        <div className="flex justify-end gap-3">
          <button type="button" onClick={onClose} className={buttonClass('secondary')}>Cancel</button>
          <button type="submit" disabled={busy} className={buttonClass()}>{busy ? 'Sending…' : 'Send request'}</button>
        </div>
      </form>
    </Modal>
  );
}
