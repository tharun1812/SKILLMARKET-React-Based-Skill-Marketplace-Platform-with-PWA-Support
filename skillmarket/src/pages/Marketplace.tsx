import { CloudOff, Search } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import SkillCard from '../components/SkillCard';
import { EmptyState, ErrorNotice, Spinner } from '../components/ui';
import { inputClass } from '../components/styles';
import { useApp } from '../context/useApp';
import { CATEGORIES, LEVELS, MODES } from '../lib/constants';
import { ServiceError } from '../lib/service';
import { cacheSkills, readCachedSkills } from '../lib/offlineCache';
import type { SkillFilters, SkillKind, SkillLevel, SkillMode, SortKey } from '../lib/types';
import { useLoad } from '../lib/useLoad';

const KIND_TABS: { value: SkillKind | ''; label: string }[] = [
  { value: '', label: 'All' }, { value: 'offer', label: 'Offered' }, { value: 'want', label: 'Wanted' },
];

export default function Marketplace() {
  const { service } = useApp();
  const [search, setSearch] = useState('');
  const [debounced, setDebounced] = useState('');
  const [category, setCategory] = useState('');
  const [level, setLevel] = useState<SkillLevel | ''>('');
  const [mode, setMode] = useState<SkillMode | ''>('');
  const [kind, setKind] = useState<SkillKind | ''>('');
  const [sort, setSort] = useState<SortKey>('newest');

  useEffect(() => {
    const t = setTimeout(() => setDebounced(search), 250);
    return () => clearTimeout(t);
  }, [search]);

  const filters = useMemo<SkillFilters>(() => ({ search: debounced, category, level, mode, kind, sort }), [debounced, category, level, mode, kind, sort]);
  const unfiltered = !debounced && !category && !level && !mode && !kind && sort === 'newest';

  const load = useCallback(async () => {
    try {
      const skills = await service.listSkills(filters);
      if (unfiltered) cacheSkills(skills);
      return { skills, savedAt: null as string | null };
    } catch (e) {
      const cached = e instanceof ServiceError && e.code === 'network' ? readCachedSkills() : null;
      if (cached && unfiltered) return { skills: cached.skills, savedAt: cached.savedAt };
      throw e;
    }
  }, [service, filters, unfiltered]);
  const { data, error, loading, reload } = useLoad(load);

  const select = 'w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm';
  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-3xl font-extrabold">Marketplace</h1>
        <p className="text-slate-600">Find a student to learn from, or someone who wants what you know.</p>
      </header>

      <div className="space-y-4 rounded-2xl border border-slate-200 bg-white p-4">
        <div className="relative">
          <label htmlFor="skill-search" className="sr-only">Search skills</label>
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" aria-hidden="true" />
          <input id="skill-search" type="search" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search by skill, topic or person"
                 className={`${inputClass()} !mt-0 pl-9`} />
        </div>
        <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Type">
          {KIND_TABS.map((t) => (
            <button key={t.label} type="button" aria-pressed={kind === t.value} onClick={() => setKind(t.value)}
                    className={`rounded-full px-4 py-1.5 text-sm font-semibold ${kind === t.value ? 'bg-brand-700 text-white' : 'bg-slate-100 text-slate-700 hover:bg-slate-200'}`}>{t.label}</button>
          ))}
        </div>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <label className="text-sm font-semibold">Category
            <select value={category} onChange={(e) => setCategory(e.target.value)} className={`${select} mt-1`}><option value="">All categories</option>{CATEGORIES.map((c) => <option key={c}>{c}</option>)}</select>
          </label>
          <label className="text-sm font-semibold">Level
            <select value={level} onChange={(e) => setLevel(e.target.value as SkillLevel | '')} className={`${select} mt-1`}><option value="">Any level</option>{LEVELS.map((l) => <option key={l.value} value={l.value}>{l.label}</option>)}</select>
          </label>
          <label className="text-sm font-semibold">How we meet
            <select value={mode} onChange={(e) => setMode(e.target.value as SkillMode | '')} className={`${select} mt-1`}><option value="">Any</option>{MODES.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}</select>
          </label>
          <label className="text-sm font-semibold">Sort by
            <select value={sort} onChange={(e) => setSort(e.target.value as SortKey)} className={`${select} mt-1`}>
              <option value="newest">Newest</option><option value="rating">Best rated</option><option value="title">Title A-Z</option>
            </select>
          </label>
        </div>
      </div>

      {data?.savedAt && (
        <p role="status" className="flex items-center gap-2 rounded-xl bg-slate-800 px-4 py-2 text-sm text-white">
          <CloudOff className="h-4 w-4" aria-hidden="true" /> You are offline: showing results saved {new Date(data.savedAt).toLocaleString()}.
        </p>
      )}
      {loading && !data && <Spinner label="Loading skills" />}
      {error && <ErrorNotice message={error} onRetry={reload} />}
      {data && (
        <>
          <p className="text-sm text-slate-500" aria-live="polite">{data.skills.length} result{data.skills.length === 1 ? '' : 's'}</p>
          {data.skills.length === 0
            ? <EmptyState title="No skills match your search">Try removing a filter or searching for something broader.</EmptyState>
            : <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{data.skills.map((s) => <SkillCard key={s.id} skill={s} />)}</div>}
        </>
      )}
    </div>
  );
}
