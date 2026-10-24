/**
 * Demo-mode backend: everything lives in the browser's localStorage, so the app runs with no server.
 * It enforces the same rules as the Supabase schema (see supabase/migrations/0001_init.sql).
 * Demo accounts are NOT secure: do not reuse real passwords here.
 */
import { canTransition } from './rules';
import { ServiceError, type Service } from './service';
import type {
  AuthUser, ExchangeRequest, OwnerSummary, Profile, ProfilePatch, RequestInput, RequestStatus, Review,
  ReviewInput, SignUpResult, Skill, SkillFilters, SkillInput,
} from './types';
import {
  assertValid, normalizeSkillInput, validateProfile, validateRequest, validateReview, validateSignUp, validateSkill,
} from './validation';

export interface KV {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export class MemoryStorage implements KV {
  private data = new Map<string, string>();
  getItem(key: string) { return this.data.get(key) ?? null; }
  setItem(key: string, value: string) { this.data.set(key, value); }
  removeItem(key: string) { this.data.delete(key); }
}

interface StoredUser { id: string; email: string; salt: string; hash: string }
interface StoredProfile { id: string; full_name: string; university: string; bio: string; created_at: string }
type StoredSkill = Omit<Skill, 'owner'>;
type StoredRequest = Omit<ExchangeRequest, 'skill_title' | 'requester_name' | 'owner_name' | 'reviewed_by_me'>;
type StoredReview = Omit<Review, 'reviewer_name'>;
interface DB {
  users: StoredUser[];
  profiles: StoredProfile[];
  skills: StoredSkill[];
  requests: StoredRequest[];
  reviews: StoredReview[];
}

const DB_KEY = 'skillmarket:v1:db';
const SESSION_KEY = 'skillmarket:v1:session';
export const DEMO_PASSWORD = 'demo1234';

function uuid(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  return 'id-' + Math.random().toString(36).slice(2) + Date.now().toString(36);
}

async function hashPassword(password: string, salt: string): Promise<string> {
  const data = new TextEncoder().encode(`${salt}:${password}`);
  if (typeof crypto !== 'undefined' && crypto.subtle) {
    const digest = await crypto.subtle.digest('SHA-256', data);
    return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
  }
  let h = 5381;                                    // demo-only fallback when SubtleCrypto is unavailable
  for (const byte of data) h = ((h << 5) + h + byte) | 0;
  return String(h >>> 0);
}

const emptyDb = (): DB => ({ users: [], profiles: [], skills: [], requests: [], reviews: [] });

export interface LocalOptions {
  storage?: KV;
  now?: () => Date;
  seed?: boolean;
}

export class LocalService implements Service {
  readonly mode = 'local' as const;
  private storage: KV;
  private now: () => Date;
  private listeners = new Set<(user: AuthUser | null) => void>();
  private ready: Promise<void>;
  private seedEnabled: boolean;

  constructor(options: LocalOptions = {}) {
    this.storage = options.storage ?? (typeof localStorage !== 'undefined' ? localStorage : new MemoryStorage());
    this.now = options.now ?? (() => new Date());
    this.seedEnabled = options.seed ?? true;
    this.ready = this.init();
  }

  // ---- storage helpers ---------------------------------------------------------------------------
  private load(): DB {
    try {
      const raw = this.storage.getItem(DB_KEY);
      return raw ? { ...emptyDb(), ...(JSON.parse(raw) as Partial<DB>) } : emptyDb();
    } catch {
      return emptyDb();
    }
  }

  private save(db: DB): void {
    this.storage.setItem(DB_KEY, JSON.stringify(db));
  }

  private stamp(offsetMs = 0): string {
    return new Date(this.now().getTime() + offsetMs).toISOString();
  }

  private async init(): Promise<void> {
    if (this.seedEnabled && this.load().users.length === 0) await this.seedDemoData();
  }

  /** Wipes everything and restores the sample data (used by the "Reset demo data" button). */
  async resetDemo(): Promise<void> {
    await this.ready;
    this.storage.removeItem(DB_KEY);
    this.storage.removeItem(SESSION_KEY);
    await this.seedDemoData();
    this.emit(null);
  }

  private emit(user: AuthUser | null): void {
    this.listeners.forEach((cb) => cb(user));
  }

  private async addUser(db: DB, email: string, password: string, fullName: string, university = '', bio = '', createdOffset = 0): Promise<string> {
    const id = uuid();
    const salt = uuid().slice(0, 8);
    db.users.push({ id, email: email.trim().toLowerCase(), salt, hash: await hashPassword(password, salt) });
    db.profiles.push({ id, full_name: fullName.trim(), university, bio, created_at: this.stamp(createdOffset) });
    return id;
  }

  // ---- seed data ---------------------------------------------------------------------------------
  private async seedDemoData(): Promise<void> {
    const db = emptyDb();
    const day = 86_400_000;
    const ana = await this.addUser(db, 'ana@demo.edu', DEMO_PASSWORD, 'Ana Lopez', 'Northfield University', 'CS junior who loves teaching and learning languages.', -30 * day);
    const ben = await this.addUser(db, 'ben@demo.edu', DEMO_PASSWORD, 'Ben Carter', 'Northfield University', 'Design student and amateur photographer.', -28 * day);
    const chen = await this.addUser(db, 'chen@demo.edu', DEMO_PASSWORD, 'Chen Wei', 'Lakeside College', 'Math major, guitar on weekends.', -25 * day);
    const dara = await this.addUser(db, 'dara@demo.edu', DEMO_PASSWORD, 'Dara Okafor', 'Lakeside College', 'Business student who cooks for friends.', -20 * day);

    const skill = (owner: string, title: string, description: string, category: string, level: StoredSkill['level'],
                   mode: StoredSkill['mode'], kind: StoredSkill['kind'], hours: number | null, tags: string[], ago: number): string => {
      const id = uuid();
      db.skills.push({ id, owner_id: owner, title, description, category, level, mode, kind, hours_estimate: hours, tags, created_at: this.stamp(-ago * day) });
      return id;
    };
    const python = skill(ana, 'Python for beginners', 'I will walk you through variables, loops and functions with small projects you can finish in an evening.', 'Programming', 'beginner', 'online', 'offer', 6, ['python', 'coding'], 12);
    skill(ana, 'Learn conversational Spanish', 'Weekly speaking practice for travel and everyday conversations.', 'Languages', 'intermediate', 'both', 'offer', 10, ['spanish'], 9);
    skill(ana, 'Help with a UI design critique', 'Looking for someone to review my portfolio site and suggest improvements.', 'Design', 'beginner', 'online', 'want', 2, ['ui', 'portfolio'], 3);
    const figma = skill(ben, 'Figma and UI design basics', 'Learn frames, components and auto layout by redesigning a real app screen together.', 'Design', 'beginner', 'online', 'offer', 5, ['figma', 'ui'], 11);
    skill(ben, 'Portrait photography on a phone', 'Lighting, posing and editing tips that work with any smartphone.', 'Photography & Video', 'beginner', 'in-person', 'offer', 3, ['photo'], 8);
    skill(ben, 'Need help with calculus II', 'Series and integration techniques are tripping me up before the final.', 'Mathematics', 'intermediate', 'both', 'want', 8, ['calculus'], 4);
    const guitar = skill(chen, 'Guitar: first songs in 4 weeks', 'Open chords, strumming patterns and three songs you can play by the end.', 'Music', 'beginner', 'in-person', 'offer', 8, ['guitar', 'music'], 10);
    skill(chen, 'Calculus and linear algebra tutoring', 'Patient explanations and lots of worked examples.', 'Mathematics', 'advanced', 'online', 'offer', 12, ['calculus', 'math'], 7);
    skill(chen, 'Learn to cook (a little)', 'I can only make instant noodles. Teach me a few real dishes?', 'Cooking', 'beginner', 'in-person', 'want', 3, ['cooking'], 2);
    skill(dara, 'Cook West African jollof and stew', 'Three classic dishes, shopping list included. We cook, then eat.', 'Cooking', 'intermediate', 'in-person', 'offer', 4, ['cooking', 'jollof'], 6);
    skill(dara, 'Resume and interview coaching', 'Rework your resume and run two mock interviews with feedback.', 'Business & Career', 'beginner', 'online', 'offer', 3, ['resume', 'career'], 5);
    skill(dara, 'Intro to Python for data analysis', 'I want to learn pandas basics for my marketing course.', 'Programming', 'beginner', 'online', 'want', 6, ['python', 'data'], 1);

    const req = (skillId: string, requester: string, owner: string, message: string, ret: string, status: StoredRequest['status'], ago: number): string => {
      const id = uuid();
      db.requests.push({ id, skill_id: skillId, requester_id: requester, owner_id: owner, message, offered_in_return: ret, status, created_at: this.stamp(-ago * day), updated_at: this.stamp(-(ago - 1) * day) });
      return id;
    };
    const done = req(python, ben, ana, 'Hi Ana, I would love to learn Python basics for a design-tech class.', 'Figma lessons', 'completed', 8);
    req(guitar, dara, chen, 'Can we meet at the music room on Thursdays?', 'Cooking lesson', 'accepted', 4);
    req(figma, ana, ben, 'Could we start with auto layout? Happy to swap for Python help.', 'Python help', 'pending', 1);

    const review = (reqId: string, reviewer: string, reviewee: string, rating: number, comment: string) =>
      db.reviews.push({ id: uuid(), request_id: reqId, reviewer_id: reviewer, reviewee_id: reviewee, rating, comment, created_at: this.stamp(-6 * day) });
    review(done, ben, ana, 5, 'Clear, patient and well prepared.');
    review(done, ana, ben, 4, 'Quick learner and great company.');

    this.save(db);
  }

  // ---- auth --------------------------------------------------------------------------------------
  private sessionUser(db: DB): AuthUser | null {
    const id = this.storage.getItem(SESSION_KEY);
    const user = id ? db.users.find((u) => u.id === id) : undefined;
    return user ? { id: user.id, email: user.email } : null;
  }

  private requireUser(db: DB): AuthUser {
    const user = this.sessionUser(db);
    if (!user) throw new ServiceError('unauthenticated', 'Please sign in to continue.');
    return user;
  }

  async getSession(): Promise<AuthUser | null> {
    await this.ready;
    return this.sessionUser(this.load());
  }

  async signUp(email: string, password: string, fullName: string): Promise<SignUpResult> {
    await this.ready;
    assertValid(validateSignUp(email, password, fullName));
    const db = this.load();
    if (db.users.some((u) => u.email === email.trim().toLowerCase())) {
      throw new ServiceError('conflict', 'An account with this email already exists.', { email: 'An account with this email already exists.' });
    }
    const id = await this.addUser(db, email, password, fullName);
    this.save(db);
    this.storage.setItem(SESSION_KEY, id);
    const user = { id, email: email.trim().toLowerCase() };
    this.emit(user);
    return { user, needsConfirmation: false };
  }

  async signIn(email: string, password: string): Promise<AuthUser> {
    await this.ready;
    const db = this.load();
    const user = db.users.find((u) => u.email === email.trim().toLowerCase());
    if (!user || (await hashPassword(password, user.salt)) !== user.hash) {
      throw new ServiceError('auth', 'Incorrect email or password.');
    }
    this.storage.setItem(SESSION_KEY, user.id);
    const result = { id: user.id, email: user.email };
    this.emit(result);
    return result;
  }

  async signOut(): Promise<void> {
    await this.ready;
    this.storage.removeItem(SESSION_KEY);
    this.emit(null);
  }

  onAuthChange(callback: (user: AuthUser | null) => void): () => void {
    this.listeners.add(callback);
    return () => { this.listeners.delete(callback); };
  }

  // ---- profiles ----------------------------------------------------------------------------------
  private rating(db: DB, userId: string): { avg_rating: number | null; review_count: number } {
    const received = db.reviews.filter((r) => r.reviewee_id === userId);
    if (received.length === 0) return { avg_rating: null, review_count: 0 };
    const avg = received.reduce((sum, r) => sum + r.rating, 0) / received.length;
    return { avg_rating: Math.round(avg * 100) / 100, review_count: received.length };
  }

  private toProfile(db: DB, p: StoredProfile): Profile {
    return { ...p, ...this.rating(db, p.id) };
  }

  async getProfile(id: string): Promise<Profile> {
    await this.ready;
    const db = this.load();
    const p = db.profiles.find((x) => x.id === id);
    if (!p) throw new ServiceError('not_found', 'Profile not found.');
    return this.toProfile(db, p);
  }

  async updateProfile(patch: ProfilePatch): Promise<Profile> {
    await this.ready;
    assertValid(validateProfile(patch));
    const db = this.load();
    const me = this.requireUser(db);
    const p = db.profiles.find((x) => x.id === me.id);
    if (!p) throw new ServiceError('not_found', 'Profile not found.');
    p.full_name = patch.full_name.trim();
    p.university = patch.university.trim();
    p.bio = patch.bio.trim();
    this.save(db);
    return this.toProfile(db, p);
  }

  // ---- skills ------------------------------------------------------------------------------------
  private owner(db: DB, id: string): OwnerSummary {
    const p = db.profiles.find((x) => x.id === id);
    return { id, full_name: p?.full_name ?? 'Unknown student', university: p?.university ?? '', ...this.rating(db, id) };
  }

  private toSkill(db: DB, s: StoredSkill): Skill {
    return { ...s, owner: this.owner(db, s.owner_id) };
  }

  async listSkills(filters: SkillFilters = {}): Promise<Skill[]> {
    await this.ready;
    const db = this.load();
    const term = (filters.search ?? '').trim().toLowerCase();
    let out = db.skills.map((s) => this.toSkill(db, s)).filter((s) => {
      if (filters.ownerId && s.owner_id !== filters.ownerId) return false;
      if (filters.category && s.category !== filters.category) return false;
      if (filters.level && s.level !== filters.level) return false;
      if (filters.kind && s.kind !== filters.kind) return false;
      if (filters.mode && s.mode !== filters.mode && s.mode !== 'both') return false;
      if (!term) return true;
      return [s.title, s.description, s.category, s.owner.full_name, ...s.tags].some((t) => t.toLowerCase().includes(term));
    });
    const sort = filters.sort ?? 'newest';
    out = out.sort((a, b) => {
      if (sort === 'title') return a.title.localeCompare(b.title);
      if (sort === 'rating') {
        const diff = (b.owner.avg_rating ?? -1) - (a.owner.avg_rating ?? -1);
        if (diff !== 0) return diff;
      }
      return b.created_at.localeCompare(a.created_at);
    });
    return out;
  }

  async getSkill(id: string): Promise<Skill> {
    await this.ready;
    const db = this.load();
    const s = db.skills.find((x) => x.id === id);
    if (!s) throw new ServiceError('not_found', 'This skill no longer exists.');
    return this.toSkill(db, s);
  }

  async createSkill(input: SkillInput): Promise<Skill> {
    await this.ready;
    const clean = normalizeSkillInput(input);
    assertValid(validateSkill(clean));
    const db = this.load();
    const me = this.requireUser(db);
    const skill: StoredSkill = { ...clean, id: uuid(), owner_id: me.id, created_at: this.stamp() };
    db.skills.push(skill);
    this.save(db);
    return this.toSkill(db, skill);
  }

  async updateSkill(id: string, input: SkillInput): Promise<Skill> {
    await this.ready;
    const clean = normalizeSkillInput(input);
    assertValid(validateSkill(clean));
    const db = this.load();
    const me = this.requireUser(db);
    const idx = db.skills.findIndex((s) => s.id === id);
    if (idx < 0) throw new ServiceError('not_found', 'This skill no longer exists.');
    if (db.skills[idx].owner_id !== me.id) throw new ServiceError('forbidden', 'You can only edit your own skills.');
    db.skills[idx] = { ...db.skills[idx], ...clean };
    this.save(db);
    return this.toSkill(db, db.skills[idx]);
  }

  async deleteSkill(id: string): Promise<void> {
    await this.ready;
    const db = this.load();
    const me = this.requireUser(db);
    const skill = db.skills.find((s) => s.id === id);
    if (!skill) throw new ServiceError('not_found', 'This skill no longer exists.');
    if (skill.owner_id !== me.id) throw new ServiceError('forbidden', 'You can only delete your own skills.');
    const gone = new Set(db.requests.filter((r) => r.skill_id === id).map((r) => r.id));
    db.skills = db.skills.filter((s) => s.id !== id);
    db.requests = db.requests.filter((r) => r.skill_id !== id);
    db.reviews = db.reviews.filter((r) => !gone.has(r.request_id));
    this.save(db);
  }

  // ---- requests ----------------------------------------------------------------------------------
  private toRequest(db: DB, r: StoredRequest, meId: string): ExchangeRequest {
    return {
      ...r,
      skill_title: db.skills.find((s) => s.id === r.skill_id)?.title ?? 'Removed skill',
      requester_name: db.profiles.find((p) => p.id === r.requester_id)?.full_name ?? 'Unknown student',
      owner_name: db.profiles.find((p) => p.id === r.owner_id)?.full_name ?? 'Unknown student',
      reviewed_by_me: db.reviews.some((v) => v.request_id === r.id && v.reviewer_id === meId),
    };
  }

  async createRequest(input: RequestInput): Promise<ExchangeRequest> {
    await this.ready;
    assertValid(validateRequest(input));
    const db = this.load();
    const me = this.requireUser(db);
    const skill = db.skills.find((s) => s.id === input.skill_id);
    if (!skill) throw new ServiceError('not_found', 'This skill no longer exists.');
    if (skill.owner_id === me.id) throw new ServiceError('forbidden', 'You cannot request your own skill.');
    if (db.requests.some((r) => r.skill_id === skill.id && r.requester_id === me.id && r.status === 'pending')) {
      throw new ServiceError('conflict', 'You already have a pending request for this skill.');
    }
    const now = this.stamp();
    const stored: StoredRequest = {
      id: uuid(), skill_id: skill.id, requester_id: me.id, owner_id: skill.owner_id,
      message: input.message.trim(), offered_in_return: input.offered_in_return.trim(),
      status: 'pending', created_at: now, updated_at: now,
    };
    db.requests.push(stored);
    this.save(db);
    return this.toRequest(db, stored, me.id);
  }

  async listRequests(): Promise<{ incoming: ExchangeRequest[]; outgoing: ExchangeRequest[] }> {
    await this.ready;
    const db = this.load();
    const me = this.requireUser(db);
    const mine = db.requests
      .filter((r) => r.owner_id === me.id || r.requester_id === me.id)
      .map((r) => this.toRequest(db, r, me.id))
      .sort((a, b) => b.updated_at.localeCompare(a.updated_at));
    return { incoming: mine.filter((r) => r.owner_id === me.id), outgoing: mine.filter((r) => r.requester_id === me.id) };
  }

  async setRequestStatus(id: string, status: RequestStatus): Promise<ExchangeRequest> {
    await this.ready;
    const db = this.load();
    const me = this.requireUser(db);
    const r = db.requests.find((x) => x.id === id);
    if (!r) throw new ServiceError('not_found', 'Request not found.');
    if (r.requester_id !== me.id && r.owner_id !== me.id) throw new ServiceError('forbidden', 'This request is not yours.');
    if (!canTransition(r, status, me.id)) {
      throw new ServiceError('invalid_transition', `You cannot change a ${r.status} request to ${status}.`);
    }
    r.status = status;
    r.updated_at = this.stamp();
    this.save(db);
    return this.toRequest(db, r, me.id);
  }

  // ---- reviews -----------------------------------------------------------------------------------
  async createReview(input: ReviewInput): Promise<Review> {
    await this.ready;
    assertValid(validateReview(input));
    const db = this.load();
    const me = this.requireUser(db);
    const r = db.requests.find((x) => x.id === input.request_id);
    if (!r) throw new ServiceError('not_found', 'Request not found.');
    if (r.requester_id !== me.id && r.owner_id !== me.id) throw new ServiceError('forbidden', 'Only the two people in an exchange can review it.');
    if (r.status !== 'completed') throw new ServiceError('invalid_transition', 'You can review an exchange once it is completed.');
    if (db.reviews.some((v) => v.request_id === r.id && v.reviewer_id === me.id)) {
      throw new ServiceError('conflict', 'You have already reviewed this exchange.');
    }
    const review: StoredReview = {
      id: uuid(), request_id: r.id, reviewer_id: me.id, reviewee_id: r.requester_id === me.id ? r.owner_id : r.requester_id,
      rating: input.rating, comment: input.comment.trim(), created_at: this.stamp(),
    };
    db.reviews.push(review);
    this.save(db);
    return { ...review, reviewer_name: db.profiles.find((p) => p.id === me.id)?.full_name ?? '' };
  }

  async listReviewsFor(userId: string): Promise<Review[]> {
    await this.ready;
    const db = this.load();
    return db.reviews
      .filter((r) => r.reviewee_id === userId)
      .map((r) => ({ ...r, reviewer_name: db.profiles.find((p) => p.id === r.reviewer_id)?.full_name ?? 'Unknown student' }))
      .sort((a, b) => b.created_at.localeCompare(a.created_at));
  }
}
