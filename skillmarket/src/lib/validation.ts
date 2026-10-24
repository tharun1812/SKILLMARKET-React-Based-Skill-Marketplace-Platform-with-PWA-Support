import { CATEGORIES, LEVELS, MODES } from './constants';
import { ServiceError } from './service';
import type { ProfilePatch, RequestInput, ReviewInput, SkillInput } from './types';

export type FieldErrors = Record<string, string>;

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export function parseTags(text: string): string[] {
  const seen = new Set<string>();
  for (const raw of text.split(',')) {
    const tag = raw.trim().toLowerCase().replace(/\s+/g, '-');
    if (tag) seen.add(tag);
  }
  return [...seen];
}

export function assertValid(errors: FieldErrors): void {
  const first = Object.values(errors)[0];
  if (first) throw new ServiceError('validation', first, errors);
}

export function validateSignUp(email: string, password: string, fullName: string): FieldErrors {
  const e: FieldErrors = {};
  if (!fullName.trim()) e.full_name = 'Enter your name.';
  else if (fullName.trim().length > 80) e.full_name = 'Name must be 80 characters or fewer.';
  if (!EMAIL.test(email.trim())) e.email = 'Enter a valid email address.';
  if (password.length < 8) e.password = 'Password must be at least 8 characters.';
  return e;
}

export function validateSkill(input: SkillInput): FieldErrors {
  const e: FieldErrors = {};
  const title = input.title.trim();
  const description = input.description.trim();
  if (title.length < 3 || title.length > 80) e.title = 'Title must be 3 to 80 characters.';
  if (description.length < 10 || description.length > 1000) e.description = 'Description must be 10 to 1000 characters.';
  if (!(CATEGORIES as readonly string[]).includes(input.category)) e.category = 'Choose a category.';
  if (!LEVELS.some((l) => l.value === input.level)) e.level = 'Choose a level.';
  if (!MODES.some((m) => m.value === input.mode)) e.mode = 'Choose how you can meet.';
  if (input.kind !== 'offer' && input.kind !== 'want') e.kind = 'Choose offer or want.';
  if (input.hours_estimate !== null && (!Number.isInteger(input.hours_estimate) || input.hours_estimate < 1 || input.hours_estimate > 200)) {
    e.hours_estimate = 'Hours must be a whole number from 1 to 200.';
  }
  if (input.tags.length > 5) e.tags = 'Use at most 5 tags.';
  else if (input.tags.some((t) => t.length > 24)) e.tags = 'Each tag must be 24 characters or fewer.';
  return e;
}

export function validateRequest(input: RequestInput): FieldErrors {
  const e: FieldErrors = {};
  const message = input.message.trim();
  if (message.length < 5 || message.length > 500) e.message = 'Message must be 5 to 500 characters.';
  if (input.offered_in_return.trim().length > 200) e.offered_in_return = 'Keep this under 200 characters.';
  return e;
}

export function validateReview(input: ReviewInput): FieldErrors {
  const e: FieldErrors = {};
  if (!Number.isInteger(input.rating) || input.rating < 1 || input.rating > 5) e.rating = 'Choose a rating from 1 to 5.';
  if (input.comment.trim().length > 500) e.comment = 'Keep the comment under 500 characters.';
  return e;
}

export function validateProfile(patch: ProfilePatch): FieldErrors {
  const e: FieldErrors = {};
  if (!patch.full_name.trim()) e.full_name = 'Enter your name.';
  else if (patch.full_name.trim().length > 80) e.full_name = 'Name must be 80 characters or fewer.';
  if (patch.university.trim().length > 120) e.university = 'Keep this under 120 characters.';
  if (patch.bio.trim().length > 500) e.bio = 'Bio must be 500 characters or fewer.';
  return e;
}

export function normalizeSkillInput(input: SkillInput): SkillInput {
  return { ...input, title: input.title.trim(), description: input.description.trim() };
}
