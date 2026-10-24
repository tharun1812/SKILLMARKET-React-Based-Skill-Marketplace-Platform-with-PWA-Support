import { motion, useReducedMotion } from 'framer-motion';
import { Clock, MapPin } from 'lucide-react';
import { Link } from 'react-router-dom';
import { LEVELS, MODES } from '../lib/constants';
import { timeAgo } from '../lib/format';
import type { Skill } from '../lib/types';
import { Avatar, StarRating } from './ui';

export default function SkillCard({ skill }: { skill: Skill }) {
  const reduce = useReducedMotion();
  const isOffer = skill.kind === 'offer';
  return (
    <motion.article whileHover={reduce ? undefined : { y: -3 }} className="flex h-full flex-col rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <span className={`rounded-full px-2.5 py-0.5 text-xs font-bold ${isOffer ? 'bg-brand-100 text-brand-800' : 'bg-spark-100 text-spark-800'}`}>
          {isOffer ? 'Offering' : 'Looking for'}
        </span>
        <span className="text-xs text-slate-500">{timeAgo(skill.created_at)}</span>
      </div>
      <h3 className="mt-3 text-lg font-bold leading-snug text-slate-900">
        <Link to={`/skills/${skill.id}`} className="hover:text-brand-700 focus:outline-none focus-visible:underline">{skill.title}</Link>
      </h3>
      <p className="mt-1 line-clamp-3 text-sm text-slate-600">{skill.description}</p>
      <ul className="mt-3 flex flex-wrap gap-2 text-xs text-slate-600">
        <li className="rounded-md bg-slate-100 px-2 py-1">{skill.category}</li>
        <li className="rounded-md bg-slate-100 px-2 py-1">{LEVELS.find((l) => l.value === skill.level)?.label}</li>
        <li className="inline-flex items-center gap-1 rounded-md bg-slate-100 px-2 py-1"><MapPin className="h-3 w-3" aria-hidden="true" />{MODES.find((m) => m.value === skill.mode)?.label}</li>
        {skill.hours_estimate !== null && (
          <li className="inline-flex items-center gap-1 rounded-md bg-slate-100 px-2 py-1"><Clock className="h-3 w-3" aria-hidden="true" />{skill.hours_estimate}h</li>
        )}
      </ul>
      <div className="mt-auto flex items-center gap-3 pt-4">
        <Avatar name={skill.owner.full_name} size="sm" />
        <div className="min-w-0">
          <Link to={`/u/${skill.owner.id}`} className="block truncate text-sm font-semibold text-slate-800 hover:underline">{skill.owner.full_name}</Link>
          <StarRating value={skill.owner.avg_rating} count={skill.owner.review_count} />
        </div>
      </div>
    </motion.article>
  );
}
