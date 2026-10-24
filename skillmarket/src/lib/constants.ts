import type { RequestStatus, SkillLevel, SkillMode } from './types';

export const CATEGORIES = [
  'Programming', 'Design', 'Languages', 'Music', 'Mathematics', 'Writing', 'Photography & Video',
  'Fitness & Sports', 'Cooking', 'Business & Career', 'Science', 'Other',
] as const;

export const LEVELS: { value: SkillLevel; label: string }[] = [
  { value: 'beginner', label: 'Beginner' },
  { value: 'intermediate', label: 'Intermediate' },
  { value: 'advanced', label: 'Advanced' },
];

export const MODES: { value: SkillMode; label: string }[] = [
  { value: 'online', label: 'Online' },
  { value: 'in-person', label: 'In person' },
  { value: 'both', label: 'Online or in person' },
];

export const STATUS_LABELS: Record<RequestStatus, string> = {
  pending: 'Pending',
  accepted: 'Accepted',
  declined: 'Declined',
  completed: 'Completed',
  cancelled: 'Cancelled',
};
