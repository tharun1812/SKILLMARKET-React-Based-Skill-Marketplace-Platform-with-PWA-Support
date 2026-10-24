import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DEMO_PASSWORD, LocalService, MemoryStorage } from './localService';
import { ServiceError } from './service';
import type { SkillInput } from './types';

let storage: MemoryStorage;
let clock: number;
const now = () => new Date(clock);
const make = (seed = true) => new LocalService({ storage, now, seed });

const skillInput = (over: Partial<SkillInput> = {}): SkillInput => ({
  title: 'Intro to Rust', description: 'Ownership and borrowing explained with small examples.', category: 'Programming',
  level: 'intermediate', mode: 'online', kind: 'offer', hours_estimate: 4, tags: ['rust'], ...over,
});

async function expectCode(promise: Promise<unknown>, code: string) {
  await expect(promise).rejects.toSatisfy((e: unknown) => e instanceof ServiceError && e.code === code);
}

beforeEach(() => {
  storage = new MemoryStorage();
  clock = Date.parse('2026-03-01T12:00:00Z');
});

describe('auth', () => {
  it('seeds demo data on first use and lets the demo user sign in', async () => {
    const s = make();
    expect((await s.listSkills()).length).toBe(12);
    const user = await s.signIn('ANA@demo.edu', DEMO_PASSWORD);
    expect(user.email).toBe('ana@demo.edu');
    expect((await s.getSession())?.id).toBe(user.id);
  });

  it('does not seed when disabled', async () => {
    expect(await make(false).listSkills()).toEqual([]);
  });

  it('rejects wrong password and unknown email with the same message', async () => {
    const s = make();
    const a = await s.signIn('ana@demo.edu', 'wrong-password').catch((e: ServiceError) => e);
    const b = await s.signIn('nobody@demo.edu', DEMO_PASSWORD).catch((e: ServiceError) => e);
    expect(a).toBeInstanceOf(ServiceError);
    expect((a as ServiceError).message).toBe((b as ServiceError).message);
    expect((a as ServiceError).code).toBe('auth');
  });

  it('signs up, signs in immediately, and blocks duplicate emails', async () => {
    const s = make(false);
    const res = await s.signUp(' New@Uni.edu ', 'longenough1', 'New Student');
    expect(res).toMatchObject({ needsConfirmation: false, user: { email: 'new@uni.edu' } });
    expect((await s.getProfile(res.user!.id)).full_name).toBe('New Student');
    await expectCode(s.signUp('new@uni.edu', 'longenough1', 'Again'), 'conflict');
  });

  it('validates sign-up fields', async () => {
    const s = make(false);
    const err = await s.signUp('not-an-email', 'short', '').catch((e: ServiceError) => e) as ServiceError;
    expect(err.code).toBe('validation');
    expect(Object.keys(err.fields!).sort()).toEqual(['email', 'full_name', 'password']);
  });

  it('stores only a salted hash, never the password', async () => {
    const s = make(false);
    await s.signUp('p@uni.edu', 'my-secret-pass', 'P');
    expect(storage.getItem('skillmarket:v1:db')).not.toContain('my-secret-pass');
  });

  it('persists the session across instances, and signOut clears it', async () => {
    const first = make();
    await first.signIn('ben@demo.edu', DEMO_PASSWORD);
    const second = make();
    expect((await second.getSession())?.email).toBe('ben@demo.edu');
    await second.signOut();
    expect(await make().getSession()).toBeNull();
  });

  it('notifies auth listeners and supports unsubscribing', async () => {
    const s = make();
    const cb = vi.fn();
    const off = s.onAuthChange(cb);
    const user = await s.signIn('ana@demo.edu', DEMO_PASSWORD);
    await s.signOut();
    expect(cb.mock.calls.map((c) => c[0]?.id ?? null)).toEqual([user.id, null]);
    off();
    await s.signIn('ana@demo.edu', DEMO_PASSWORD);
    expect(cb).toHaveBeenCalledTimes(2);
  });
});

describe('skills', () => {
  it('requires sign-in and valid input to create a skill', async () => {
    const s = make();
    await expectCode(s.createSkill(skillInput()), 'unauthenticated');
    await s.signIn('ana@demo.edu', DEMO_PASSWORD);
    await expectCode(s.createSkill(skillInput({ title: 'ab' })), 'validation');
    await expectCode(s.createSkill(skillInput({ category: 'Nonsense' })), 'validation');
    await expectCode(s.createSkill(skillInput({ hours_estimate: 500 })), 'validation');
    await expectCode(s.createSkill(skillInput({ tags: ['a', 'b', 'c', 'd', 'e', 'f'] })), 'validation');
    const created = await s.createSkill(skillInput({ title: '  Intro to Rust  ' }));
    expect(created.title).toBe('Intro to Rust');
    expect(created.owner.full_name).toBe('Ana Lopez');
  });

  it('only the owner can edit or delete', async () => {
    const s = make();
    await s.signIn('ana@demo.edu', DEMO_PASSWORD);
    const mine = await s.createSkill(skillInput());
    await s.signIn('ben@demo.edu', DEMO_PASSWORD);
    await expectCode(s.updateSkill(mine.id, skillInput({ title: 'Hijacked' })), 'forbidden');
    await expectCode(s.deleteSkill(mine.id), 'forbidden');
    await s.signIn('ana@demo.edu', DEMO_PASSWORD);
    expect((await s.updateSkill(mine.id, skillInput({ title: 'Rust, revised' }))).title).toBe('Rust, revised');
    await s.deleteSkill(mine.id);
    await expectCode(s.getSkill(mine.id), 'not_found');
  });

  it('filters by search, category, level, kind and mode (both matches any mode)', async () => {
    const s = make();
    expect((await s.listSkills({ search: 'python' })).length).toBe(2);
    expect((await s.listSkills({ search: 'Dara' })).every((k) => k.owner.full_name === 'Dara Okafor')).toBe(true);
    expect((await s.listSkills({ category: 'Cooking' })).length).toBe(2);
    expect((await s.listSkills({ kind: 'want' })).length).toBe(4);
    expect((await s.listSkills({ level: 'advanced' })).length).toBe(1);
    const online = await s.listSkills({ mode: 'online' });
    expect(online.every((k) => k.mode === 'online' || k.mode === 'both')).toBe(true);
    expect(await s.listSkills({ search: 'zzzz-nothing' })).toEqual([]);
  });

  it('sorts by title and by owner rating', async () => {
    const s = make();
    const titles = (await s.listSkills({ sort: 'title' })).map((k) => k.title);
    expect(titles).toEqual([...titles].sort((a, b) => a.localeCompare(b)));
    const rated = await s.listSkills({ sort: 'rating' });
    expect(rated[0].owner.full_name).toBe('Ana Lopez');          // 5-star review in the seed data
    expect(rated[rated.length - 1].owner.avg_rating).toBeNull();
  });
});

describe('exchange requests', () => {
  async function setup() {
    const s = make();
    await s.signIn('chen@demo.edu', DEMO_PASSWORD);
    const python = (await s.listSkills({ ownerId: (await s.getSession())!.id })).length;
    expect(python).toBeGreaterThan(0);
    const ana = (await s.listSkills({ search: 'Python for beginners' }))[0];
    return { s, ana };
  }

  it('creates a request and rejects own skills and duplicates', async () => {
    const { s, ana } = await setup();
    const req = await s.createRequest({ skill_id: ana.id, message: 'Can we start next week?', offered_in_return: 'Calculus help' });
    expect(req).toMatchObject({ status: 'pending', owner_name: 'Ana Lopez', requester_name: 'Chen Wei', skill_title: 'Python for beginners' });
    await expectCode(s.createRequest({ skill_id: ana.id, message: 'Second try please', offered_in_return: '' }), 'conflict');
    const own = (await s.listSkills({ ownerId: (await s.getSession())!.id }))[0];
    await expectCode(s.createRequest({ skill_id: own.id, message: 'Myself please', offered_in_return: '' }), 'forbidden');
    await expectCode(s.createRequest({ skill_id: ana.id, message: 'hi', offered_in_return: '' }), 'validation');
  });

  it('allows a new request after the previous one was cancelled', async () => {
    const { s, ana } = await setup();
    const first = await s.createRequest({ skill_id: ana.id, message: 'First request here', offered_in_return: '' });
    await s.setRequestStatus(first.id, 'cancelled');
    expect((await s.createRequest({ skill_id: ana.id, message: 'Trying again now', offered_in_return: '' })).status).toBe('pending');
  });

  it('follows the status rules: owner accepts, either party completes, nobody goes backwards', async () => {
    const { s, ana } = await setup();
    const req = await s.createRequest({ skill_id: ana.id, message: 'Please teach me', offered_in_return: '' });
    await expectCode(s.setRequestStatus(req.id, 'accepted'), 'invalid_transition');     // requester cannot accept
    await expectCode(s.setRequestStatus(req.id, 'completed'), 'invalid_transition');    // cannot skip a step
    await s.signIn('dara@demo.edu', DEMO_PASSWORD);
    await expectCode(s.setRequestStatus(req.id, 'accepted'), 'forbidden');              // a stranger
    await s.signIn('ana@demo.edu', DEMO_PASSWORD);
    expect((await s.setRequestStatus(req.id, 'accepted')).status).toBe('accepted');
    await expectCode(s.setRequestStatus(req.id, 'pending' as never), 'invalid_transition');
    await expectCode(s.setRequestStatus(req.id, 'declined'), 'invalid_transition');     // too late to decline
    expect((await s.setRequestStatus(req.id, 'completed')).status).toBe('completed');
    await expectCode(s.setRequestStatus(req.id, 'cancelled'), 'invalid_transition');
  });

  it('lists incoming and outgoing requests separately, newest first', async () => {
    const s = make();
    await s.signIn('ana@demo.edu', DEMO_PASSWORD);
    const { incoming, outgoing } = await s.listRequests();
    expect(incoming.map((r) => r.status)).toEqual(['completed']);      // Ben's finished Python request
    expect(outgoing.map((r) => r.skill_title)).toEqual(['Figma and UI design basics']);
    expect(incoming[0].reviewed_by_me).toBe(true);
  });
});

describe('reviews', () => {
  async function completed() {
    const s = make();
    await s.signIn('chen@demo.edu', DEMO_PASSWORD);
    const ana = (await s.listSkills({ search: 'Spanish' }))[0];
    const req = await s.createRequest({ skill_id: ana.id, message: 'Spanish practice please', offered_in_return: '' });
    await s.signIn('ana@demo.edu', DEMO_PASSWORD);
    await s.setRequestStatus(req.id, 'accepted');
    return { s, req, ana };
  }

  it('only allows reviews after completion, once each, by participants', async () => {
    const { s, req } = await completed();
    await expectCode(s.createReview({ request_id: req.id, rating: 5, comment: '' }), 'invalid_transition');
    await s.setRequestStatus(req.id, 'completed');
    await expectCode(s.createReview({ request_id: req.id, rating: 9, comment: '' }), 'validation');
    const review = await s.createReview({ request_id: req.id, rating: 4, comment: ' Great  ' });
    expect(review).toMatchObject({ reviewer_name: 'Ana Lopez', rating: 4, comment: 'Great' });
    await expectCode(s.createReview({ request_id: req.id, rating: 5, comment: '' }), 'conflict');
    await s.signIn('dara@demo.edu', DEMO_PASSWORD);
    await expectCode(s.createReview({ request_id: req.id, rating: 1, comment: '' }), 'forbidden');
  });

  it('updates the reviewee rating and lists reviews received', async () => {
    const { s, req } = await completed();
    await s.setRequestStatus(req.id, 'completed');
    await s.createReview({ request_id: req.id, rating: 1, comment: 'Late' });
    const chen = (await s.listSkills({ search: 'Calculus and linear' }))[0].owner_id;
    const profile = await s.getProfile(chen);
    expect(profile).toMatchObject({ avg_rating: 1, review_count: 1 });
    expect((await s.listReviewsFor(chen))[0].comment).toBe('Late');
  });
});

describe('cascade and profile', () => {
  it('deleting a skill removes its requests and their reviews', async () => {
    const s = make();
    await s.signIn('ana@demo.edu', DEMO_PASSWORD);
    const python = (await s.listSkills({ search: 'Python for beginners' }))[0];
    const ana = (await s.getSession())!.id;
    expect((await s.getProfile(ana)).review_count).toBe(1);
    await s.deleteSkill(python.id);
    expect((await s.getProfile(ana)).review_count).toBe(0);
    expect((await s.listRequests()).incoming).toEqual([]);
  });

  it('updates the profile with validation', async () => {
    const s = make();
    await s.signIn('ana@demo.edu', DEMO_PASSWORD);
    await expectCode(s.updateProfile({ full_name: '', university: '', bio: '' }), 'validation');
    const p = await s.updateProfile({ full_name: ' Ana L. ', university: 'MIT', bio: 'Hello' });
    expect(p).toMatchObject({ full_name: 'Ana L.', university: 'MIT', bio: 'Hello' });
  });

  it('resetDemo restores the sample data and signs out', async () => {
    const s = make();
    await s.signIn('ana@demo.edu', DEMO_PASSWORD);
    await s.createSkill(skillInput());
    await s.resetDemo();
    expect((await s.listSkills()).length).toBe(12);
    expect(await s.getSession()).toBeNull();
  });
});
