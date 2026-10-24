import type { SupabaseClient } from '@supabase/supabase-js';
import { ServiceError, type ErrorCode, type Service } from './service';
import type {
  AuthUser, ExchangeRequest, OwnerSummary, Profile, ProfilePatch, RequestInput, RequestStatus, Review,
  ReviewInput, SignUpResult, Skill, SkillFilters, SkillInput,
} from './types';
import {
  assertValid, normalizeSkillInput, validateProfile, validateRequest, validateReview, validateSignUp, validateSkill,
} from './validation';

interface DbError { code?: string; message: string }

/** Turns PostgREST / Postgres errors into errors the UI can show. */
export function mapError(error: DbError): ServiceError {
  const table: Record<string, [ErrorCode, string]> = {
    '23505': ['conflict', 'That already exists. You may have a pending request or review for this item.'],
    '42501': ['forbidden', 'You are not allowed to do that.'],
    '23514': ['validation', 'Some values are out of range. Please check the form.'],
    '23503': ['not_found', 'The related item no longer exists.'],
    PGRST116: ['not_found', 'Not found.'],
  };
  if (error.code === 'P0001') return new ServiceError('invalid_transition', error.message);      // raised by our triggers
  const hit = error.code ? table[error.code] : undefined;
  if (hit) return new ServiceError(hit[0], hit[1]);
  if (/failed to fetch|network/i.test(error.message)) return new ServiceError('network', 'You appear to be offline. Try again when you are connected.');
  return new ServiceError('unknown', error.message);
}

function check<T>(result: { data: T | null; error: DbError | null }): T {
  if (result.error) throw mapError(result.error);
  return result.data as T;
}

interface RatingRow { reviewee_id: string; avg_rating: number | string; review_count: number }
interface OwnerRow { id: string; full_name: string; university: string }
interface SkillRow extends Omit<Skill, 'owner'> { owner: OwnerRow | null }
interface RequestRow extends Omit<ExchangeRequest, 'skill_title' | 'requester_name' | 'owner_name' | 'reviewed_by_me'> {
  skill: { id: string; title: string } | null;
  requester: { id: string; full_name: string } | null;
  owner: { id: string; full_name: string } | null;
}
interface ReviewRow extends Omit<Review, 'reviewer_name'> { reviewer?: { full_name: string } | null }

const SKILL_SELECT = '*, owner:profiles!skills_owner_id_fkey(id, full_name, university)';
const REQUEST_SELECT =
  '*, skill:skills(id, title), requester:profiles!exchange_requests_requester_id_fkey(id, full_name), owner:profiles!exchange_requests_owner_id_fkey(id, full_name)';

export class SupabaseService implements Service {
  readonly mode = 'supabase' as const;
  constructor(private client: SupabaseClient) {}

  // ---- auth --------------------------------------------------------------------------------------
  private toUser(u: { id: string; email?: string | null } | null | undefined): AuthUser | null {
    return u ? { id: u.id, email: u.email ?? '' } : null;
  }

  private async requireUser(): Promise<AuthUser> {
    const { data } = await this.client.auth.getSession();
    const user = this.toUser(data.session?.user);
    if (!user) throw new ServiceError('unauthenticated', 'Please sign in to continue.');
    return user;
  }

  async getSession(): Promise<AuthUser | null> {
    const { data } = await this.client.auth.getSession();
    return this.toUser(data.session?.user);
  }

  async signUp(email: string, password: string, fullName: string): Promise<SignUpResult> {
    assertValid(validateSignUp(email, password, fullName));
    const { data, error } = await this.client.auth.signUp({
      email: email.trim(), password, options: { data: { full_name: fullName.trim() } },
    });
    if (error) throw new ServiceError('auth', error.message);
    return { user: this.toUser(data.user), needsConfirmation: !data.session };
  }

  async signIn(email: string, password: string): Promise<AuthUser> {
    const { data, error } = await this.client.auth.signInWithPassword({ email: email.trim(), password });
    if (error) throw new ServiceError('auth', error.message);
    return this.toUser(data.user) as AuthUser;
  }

  async signOut(): Promise<void> {
    const { error } = await this.client.auth.signOut();
    if (error) throw new ServiceError('auth', error.message);
  }

  onAuthChange(callback: (user: AuthUser | null) => void): () => void {
    const { data } = this.client.auth.onAuthStateChange((_event, session) => callback(this.toUser(session?.user)));
    return () => data.subscription.unsubscribe();
  }

  // ---- profiles ----------------------------------------------------------------------------------
  private async ratings(ids: string[]): Promise<Map<string, { avg_rating: number; review_count: number }>> {
    const map = new Map<string, { avg_rating: number; review_count: number }>();
    if (ids.length === 0) return map;
    const rows = check(await this.client.from('profile_ratings').select('*').in('reviewee_id', ids)) as RatingRow[] | null;
    for (const r of rows ?? []) map.set(r.reviewee_id, { avg_rating: Number(r.avg_rating), review_count: r.review_count });
    return map;
  }

  async getProfile(id: string): Promise<Profile> {
    const row = check(await this.client.from('profiles').select('*').eq('id', id).single()) as Omit<Profile, 'avg_rating' | 'review_count'>;
    const rating = (await this.ratings([id])).get(id);
    return { ...row, avg_rating: rating?.avg_rating ?? null, review_count: rating?.review_count ?? 0 };
  }

  async updateProfile(patch: ProfilePatch): Promise<Profile> {
    assertValid(validateProfile(patch));
    const me = await this.requireUser();
    check(await this.client.from('profiles').update({
      full_name: patch.full_name.trim(), university: patch.university.trim(), bio: patch.bio.trim(),
    }).eq('id', me.id).select().single());
    return this.getProfile(me.id);
  }

  // ---- skills ------------------------------------------------------------------------------------
  private withOwner(row: SkillRow, ratings: Map<string, { avg_rating: number; review_count: number }>): Skill {
    const rating = ratings.get(row.owner_id);
    const owner: OwnerSummary = {
      id: row.owner_id, full_name: row.owner?.full_name ?? 'Unknown student', university: row.owner?.university ?? '',
      avg_rating: rating?.avg_rating ?? null, review_count: rating?.review_count ?? 0,
    };
    const { owner: _drop, ...rest } = row;     // eslint-disable-line @typescript-eslint/no-unused-vars
    return { ...rest, owner };
  }

  async listSkills(filters: SkillFilters = {}): Promise<Skill[]> {
    let query = this.client.from('skills').select(SKILL_SELECT);
    if (filters.ownerId) query = query.eq('owner_id', filters.ownerId);
    if (filters.category) query = query.eq('category', filters.category);
    if (filters.level) query = query.eq('level', filters.level);
    if (filters.kind) query = query.eq('kind', filters.kind);
    if (filters.mode) query = query.in('mode', [filters.mode, 'both']);
    const term = (filters.search ?? '').replace(/[%,()*]/g, ' ').replace(/\s+/g, ' ').trim();
    if (term) query = query.or(`title.ilike.%${term}%,description.ilike.%${term}%`);
    query = filters.sort === 'title' ? query.order('title', { ascending: true }) : query.order('created_at', { ascending: false });

    const rows = (check(await query) ?? []) as unknown as SkillRow[];
    const ratings = await this.ratings([...new Set(rows.map((r) => r.owner_id))]);
    const skills = rows.map((r) => this.withOwner(r, ratings));
    if (filters.sort === 'rating') {
      skills.sort((a, b) => (b.owner.avg_rating ?? -1) - (a.owner.avg_rating ?? -1) || b.created_at.localeCompare(a.created_at));
    }
    return skills;
  }

  async getSkill(id: string): Promise<Skill> {
    const row = check(await this.client.from('skills').select(SKILL_SELECT).eq('id', id).single()) as unknown as SkillRow;
    return this.withOwner(row, await this.ratings([row.owner_id]));
  }

  async createSkill(input: SkillInput): Promise<Skill> {
    const clean = normalizeSkillInput(input);
    assertValid(validateSkill(clean));
    const me = await this.requireUser();
    const row = check(await this.client.from('skills').insert({ ...clean, owner_id: me.id }).select('id').single()) as { id: string };
    return this.getSkill(row.id);
  }

  async updateSkill(id: string, input: SkillInput): Promise<Skill> {
    const clean = normalizeSkillInput(input);
    assertValid(validateSkill(clean));
    check(await this.client.from('skills').update(clean).eq('id', id).select('id').single());
    return this.getSkill(id);
  }

  async deleteSkill(id: string): Promise<void> {
    const { error } = await this.client.from('skills').delete().eq('id', id);
    if (error) throw mapError(error);
  }

  // ---- requests ----------------------------------------------------------------------------------
  private toRequest(row: RequestRow, reviewed: Set<string>): ExchangeRequest {
    const { skill, requester, owner, ...rest } = row;
    return {
      ...rest,
      skill_title: skill?.title ?? 'Removed skill',
      requester_name: requester?.full_name ?? 'Unknown student',
      owner_name: owner?.full_name ?? 'Unknown student',
      reviewed_by_me: reviewed.has(row.id),
    };
  }

  private async reviewedByMe(userId: string): Promise<Set<string>> {
    const rows = check(await this.client.from('reviews').select('request_id').eq('reviewer_id', userId)) as { request_id: string }[] | null;
    return new Set((rows ?? []).map((r) => r.request_id));
  }

  async createRequest(input: RequestInput): Promise<ExchangeRequest> {
    assertValid(validateRequest(input));
    const me = await this.requireUser();
    const inserted = check(await this.client.from('exchange_requests').insert({
      skill_id: input.skill_id, requester_id: me.id, owner_id: me.id,   // owner_id is replaced by a database trigger
      message: input.message.trim(), offered_in_return: input.offered_in_return.trim(),
    }).select(REQUEST_SELECT).single()) as unknown as RequestRow;
    return this.toRequest(inserted, new Set());
  }

  async listRequests(): Promise<{ incoming: ExchangeRequest[]; outgoing: ExchangeRequest[] }> {
    const me = await this.requireUser();
    const rows = (check(await this.client.from('exchange_requests').select(REQUEST_SELECT)
      .or(`requester_id.eq.${me.id},owner_id.eq.${me.id}`).order('updated_at', { ascending: false })) ?? []) as unknown as RequestRow[];
    const reviewed = await this.reviewedByMe(me.id);
    const all = rows.map((r) => this.toRequest(r, reviewed));
    return { incoming: all.filter((r) => r.owner_id === me.id), outgoing: all.filter((r) => r.requester_id === me.id) };
  }

  async setRequestStatus(id: string, status: RequestStatus): Promise<ExchangeRequest> {
    const me = await this.requireUser();
    const row = check(await this.client.from('exchange_requests').update({ status }).eq('id', id)
      .select(REQUEST_SELECT).single()) as unknown as RequestRow;     // the DB trigger rejects illegal transitions
    return this.toRequest(row, await this.reviewedByMe(me.id));
  }

  // ---- reviews -----------------------------------------------------------------------------------
  async createReview(input: ReviewInput): Promise<Review> {
    assertValid(validateReview(input));
    const me = await this.requireUser();
    const request = check(await this.client.from('exchange_requests').select('requester_id, owner_id').eq('id', input.request_id).single()) as
      { requester_id: string; owner_id: string };
    const reviewee = request.requester_id === me.id ? request.owner_id : request.requester_id;
    const row = check(await this.client.from('reviews').insert({
      request_id: input.request_id, reviewer_id: me.id, reviewee_id: reviewee, rating: input.rating, comment: input.comment.trim(),
    }).select('*').single()) as unknown as Omit<Review, 'reviewer_name'>;
    return { ...row, reviewer_name: (await this.getProfile(me.id)).full_name };
  }

  async listReviewsFor(userId: string): Promise<Review[]> {
    const rows = (check(await this.client.from('reviews').select('*, reviewer:profiles!reviews_reviewer_id_fkey(full_name)')
      .eq('reviewee_id', userId).order('created_at', { ascending: false })) ?? []) as unknown as ReviewRow[];
    return rows.map(({ reviewer, ...rest }) => ({ ...rest, reviewer_name: reviewer?.full_name ?? 'Unknown student' }));
  }
}
