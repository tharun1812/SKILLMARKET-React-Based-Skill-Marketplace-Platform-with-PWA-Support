import { describe, expect, it } from 'vitest';
import { formatRating, initials, timeAgo } from './format';
import { availableActions, canTransition, computeStats } from './rules';
import type { ExchangeRequest, RequestStatus, Skill } from './types';
import { parseTags, validateProfile, validateRequest, validateReview, validateSignUp } from './validation';

const base = { requester_id: 'req', owner_id: 'own' };

describe('canTransition', () => {
  const cases: [RequestStatus, RequestStatus, string, boolean][] = [
    ['pending', 'accepted', 'own', true], ['pending', 'accepted', 'req', false],
    ['pending', 'declined', 'own', true], ['pending', 'declined', 'req', false],
    ['pending', 'cancelled', 'req', true], ['pending', 'cancelled', 'own', false],
    ['pending', 'completed', 'own', false], ['pending', 'completed', 'req', false],
    ['accepted', 'completed', 'own', true], ['accepted', 'completed', 'req', true],
    ['accepted', 'cancelled', 'own', true], ['accepted', 'cancelled', 'req', true],
    ['accepted', 'declined', 'own', false], ['accepted', 'pending' as RequestStatus, 'own', false],
    ['accepted', 'completed', 'stranger', false],
    ['completed', 'cancelled', 'own', false], ['declined', 'accepted', 'own', false], ['cancelled', 'pending' as RequestStatus, 'req', false],
  ];
  it.each(cases)('%s -> %s by %s is %s', (from, to, actor, allowed) => {
    expect(canTransition({ ...base, status: from }, to, actor)).toBe(allowed);
  });

  it('lists the actions available to each party', () => {
    const r = { ...base, status: 'pending' } as ExchangeRequest;
    expect(availableActions(r, 'own').sort()).toEqual(['accepted', 'declined']);
    expect(availableActions(r, 'req')).toEqual(['cancelled']);
    expect(availableActions({ ...r, status: 'completed' }, 'own')).toEqual([]);
  });
});

describe('computeStats', () => {
  const mk = (status: RequestStatus) => ({ status } as ExchangeRequest);
  it('counts offers, wants and request states', () => {
    const skills = [{ kind: 'offer' }, { kind: 'offer' }, { kind: 'want' }] as Skill[];
    expect(computeStats(skills, [mk('pending'), mk('accepted')], [mk('pending'), mk('completed'), mk('completed')])).toEqual({
      offers: 2, wants: 1, incomingPending: 1, outgoingPending: 1, active: 1, completed: 2,
    });
  });
});

describe('validation helpers', () => {
  it('parses tags: trims, lowercases, hyphenates, de-duplicates', () => {
    expect(parseTags(' Python, Data Science ,python,, ')).toEqual(['python', 'data-science']);
    expect(parseTags('')).toEqual([]);
  });
  it('validates requests, reviews, profiles and sign-up', () => {
    expect(validateRequest({ skill_id: 'x', message: 'ok!!', offered_in_return: '' }).message).toBeDefined();
    expect(validateRequest({ skill_id: 'x', message: 'valid message', offered_in_return: 'y'.repeat(201) }).offered_in_return).toBeDefined();
    expect(validateReview({ request_id: 'x', rating: 3.5, comment: '' }).rating).toBeDefined();
    expect(validateReview({ request_id: 'x', rating: 5, comment: '' })).toEqual({});
    expect(validateProfile({ full_name: 'A', university: 'x'.repeat(121), bio: '' }).university).toBeDefined();
    expect(validateSignUp('a@b.co', 'longenough', 'Name')).toEqual({});
  });
});

describe('format helpers', () => {
  const now = new Date('2026-03-10T12:00:00Z');
  it('timeAgo', () => {
    expect(timeAgo('2026-03-10T11:59:50Z', now)).toBe('just now');
    expect(timeAgo('2026-03-10T11:30:00Z', now)).toBe('30m ago');
    expect(timeAgo('2026-03-10T09:00:00Z', now)).toBe('3h ago');
    expect(timeAgo('2026-03-07T12:00:00Z', now)).toBe('3d ago');
    expect(timeAgo('2026-02-10T12:00:00Z', now)).toBe('4w ago');
    expect(timeAgo('2025-12-10T12:00:00Z', now)).toBe('3mo ago');
    expect(timeAgo('2026-03-11T12:00:00Z', now)).toBe('just now');          // future timestamps never go negative
  });
  it('initials and rating text', () => {
    expect(initials('Ana Lopez')).toBe('AL');
    expect(initials('  cher ')).toBe('C');
    expect(initials('')).toBe('?');
    expect(formatRating(4.666, 3)).toBe('4.7 (3)');
    expect(formatRating(null, 0)).toBe('No reviews yet');
  });
});
