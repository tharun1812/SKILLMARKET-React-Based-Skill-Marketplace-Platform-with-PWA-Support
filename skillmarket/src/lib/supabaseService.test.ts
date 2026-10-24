import type { SupabaseClient } from '@supabase/supabase-js';
import { describe, expect, it } from 'vitest';
import { ServiceError } from './service';
import { SupabaseService, mapError } from './supabaseService';
import { createService, hasSupabaseConfig } from './supabase';
import { LocalService } from './localService';

interface Op { table: string; action: string; payload?: unknown; filters: [string, ...unknown[]][]; single: boolean }
type Result = { data: unknown; error: { code?: string; message: string } | null };

/** A tiny stand-in for the Supabase client: records each query and returns canned results. */
function fakeClient(respond: (op: Op) => Result, session: { user: { id: string; email: string } } | null = { user: { id: 'me', email: 'me@uni.edu' } }) {
  const ops: Op[] = [];
  const builder = (table: string) => {
    const op: Op = { table, action: 'select', filters: [], single: false };
    const q: Record<string, unknown> = {
      select: () => q, order: (...a: unknown[]) => { op.filters.push(['order', ...a]); return q; },
      insert: (p: unknown) => { op.action = 'insert'; op.payload = p; return q; },
      update: (p: unknown) => { op.action = 'update'; op.payload = p; return q; },
      delete: () => { op.action = 'delete'; return q; },
      eq: (...a: unknown[]) => { op.filters.push(['eq', ...a]); return q; },
      in: (...a: unknown[]) => { op.filters.push(['in', ...a]); return q; },
      or: (...a: unknown[]) => { op.filters.push(['or', ...a]); return q; },
      single: () => { op.single = true; return q; },
      then: (ok: (r: Result) => unknown, bad: (e: unknown) => unknown) => { ops.push(op); return Promise.resolve(respond(op)).then(ok, bad); },
    };
    return q;
  };
  const client = {
    from: builder,
    auth: {
      getSession: async () => ({ data: { session } }),
      signUp: async () => ({ data: { user: { id: 'new', email: 'n@uni.edu' }, session: null }, error: null }),
      signInWithPassword: async () => ({ data: { user: { id: 'me', email: 'me@uni.edu' } }, error: null }),
      signOut: async () => ({ error: null }),
      onAuthStateChange: () => ({ data: { subscription: { unsubscribe: () => undefined } } }),
    },
  };
  return { client: client as unknown as SupabaseClient, ops };
}

const ok = (data: unknown): Result => ({ data, error: null });

describe('mapError', () => {
  it('maps database error codes to service errors', () => {
    expect(mapError({ code: '23505', message: 'dup' }).code).toBe('conflict');
    expect(mapError({ code: '42501', message: 'rls' }).code).toBe('forbidden');
    expect(mapError({ code: '23514', message: 'check' }).code).toBe('validation');
    expect(mapError({ code: 'PGRST116', message: 'none' }).code).toBe('not_found');
    const t = mapError({ code: 'P0001', message: 'invalid status change from pending to completed' });
    expect(t).toMatchObject({ code: 'invalid_transition', message: 'invalid status change from pending to completed' });
    expect(mapError({ message: 'TypeError: Failed to fetch' }).code).toBe('network');
    expect(mapError({ message: 'weird' }).code).toBe('unknown');
  });
});

describe('SupabaseService', () => {
  it('lists skills with filters and merges owner ratings', async () => {
    const { client, ops } = fakeClient((op) => {
      if (op.table === 'profile_ratings') return ok([{ reviewee_id: 'o1', avg_rating: '4.50', review_count: 2 }]);
      return ok([
        { id: 's1', owner_id: 'o1', title: 'A', owner: { id: 'o1', full_name: 'Ana', university: 'NU' }, created_at: '2026-01-02' },
        { id: 's2', owner_id: 'o2', title: 'B', owner: null, created_at: '2026-01-03' },
      ]);
    });
    const skills = await new SupabaseService(client).listSkills({ category: 'Music', mode: 'online', search: 'gui%tar,(x)', sort: 'rating' });
    const q = ops[0];
    expect(q.filters).toContainEqual(['eq', 'category', 'Music']);
    expect(q.filters).toContainEqual(['in', 'mode', ['online', 'both']]);
    expect(q.filters).toContainEqual(['or', 'title.ilike.%gui tar x%,description.ilike.%gui tar x%']);   // wildcard/syntax chars stripped
    expect(skills.map((s) => [s.id, s.owner.full_name, s.owner.avg_rating])).toEqual([['s1', 'Ana', 4.5], ['s2', 'Unknown student', null]]);
  });

  it('requires a signed-in user for writes', async () => {
    const { client } = fakeClient(() => ok(null), null);
    const svc = new SupabaseService(client);
    await expect(svc.createRequest({ skill_id: 's', message: 'Hello there', offered_in_return: '' }))
      .rejects.toMatchObject({ code: 'unauthenticated' });
  });

  it('creates a request (owner is set by the database) and maps the joined row', async () => {
    const { client, ops } = fakeClient(() => ok({
      id: 'r1', skill_id: 's1', requester_id: 'me', owner_id: 'o1', message: 'Hello there', offered_in_return: '', status: 'pending',
      created_at: 't', updated_at: 't', skill: { id: 's1', title: 'Guitar' }, requester: { id: 'me', full_name: 'Me' }, owner: { id: 'o1', full_name: 'Chen' },
    }));
    const r = await new SupabaseService(client).createRequest({ skill_id: 's1', message: ' Hello there ', offered_in_return: '' });
    expect(ops[0].payload).toMatchObject({ skill_id: 's1', requester_id: 'me', message: 'Hello there' });
    expect(r).toMatchObject({ skill_title: 'Guitar', owner_name: 'Chen', requester_name: 'Me', status: 'pending' });
  });

  it('surfaces trigger errors for illegal status changes', async () => {
    const { client } = fakeClient(() => ({ data: null, error: { code: 'P0001', message: 'invalid status change from pending to completed' } }));
    await expect(new SupabaseService(client).setRequestStatus('r1', 'completed')).rejects.toMatchObject({ code: 'invalid_transition' });
  });

  it('splits requests into incoming and outgoing and flags reviewed ones', async () => {
    const row = (id: string, requester: string, owner: string) => ({
      id, skill_id: 's', requester_id: requester, owner_id: owner, message: 'm', offered_in_return: '', status: 'completed',
      created_at: 't', updated_at: 't', skill: { id: 's', title: 'T' }, requester: { id: requester, full_name: 'R' }, owner: { id: owner, full_name: 'O' },
    });
    const { client } = fakeClient((op) => op.table === 'reviews' ? ok([{ request_id: 'a' }]) : ok([row('a', 'me', 'x'), row('b', 'y', 'me')]));
    const { incoming, outgoing } = await new SupabaseService(client).listRequests();
    expect(outgoing.map((r) => [r.id, r.reviewed_by_me])).toEqual([['a', true]]);
    expect(incoming.map((r) => [r.id, r.reviewed_by_me])).toEqual([['b', false]]);
  });

  it('sign-up reports when email confirmation is required', async () => {
    const { client } = fakeClient(() => ok(null));
    expect(await new SupabaseService(client).signUp('n@uni.edu', 'longenough', 'New')).toEqual({ user: { id: 'new', email: 'n@uni.edu' }, needsConfirmation: true });
  });

  it('validates before calling the network', async () => {
    const { client, ops } = fakeClient(() => ok(null));
    await expect(new SupabaseService(client).createSkill({ title: 'x', description: 'y', category: 'z', level: 'beginner', mode: 'online', kind: 'offer', hours_estimate: null, tags: [] }))
      .rejects.toBeInstanceOf(ServiceError);
    expect(ops).toHaveLength(0);
  });
});

describe('createService', () => {
  it('falls back to the local demo backend when Supabase is not configured', () => {
    expect(hasSupabaseConfig({})).toBe(false);
    expect(hasSupabaseConfig({ VITE_SUPABASE_URL: 'https://x.supabase.co', VITE_SUPABASE_ANON_KEY: ' ' })).toBe(false);
    expect(createService({})).toBeInstanceOf(LocalService);
  });
  it('uses Supabase when both variables are set', () => {
    const svc = createService({ VITE_SUPABASE_URL: 'https://x.supabase.co', VITE_SUPABASE_ANON_KEY: 'anon-key' });
    expect(svc.mode).toBe('supabase');
  });
});
