export type SkillKind = 'offer' | 'want';
export type SkillLevel = 'beginner' | 'intermediate' | 'advanced';
export type SkillMode = 'online' | 'in-person' | 'both';
export type RequestStatus = 'pending' | 'accepted' | 'declined' | 'completed' | 'cancelled';
export type SortKey = 'newest' | 'rating' | 'title';

export interface AuthUser {
  id: string;
  email: string;
}

export interface SignUpResult {
  user: AuthUser | null;
  /** True when the project requires email confirmation before the first sign-in. */
  needsConfirmation: boolean;
}

export interface Profile {
  id: string;
  full_name: string;
  university: string;
  bio: string;
  created_at: string;
  avg_rating: number | null;
  review_count: number;
}

export interface ProfilePatch {
  full_name: string;
  university: string;
  bio: string;
}

export interface OwnerSummary {
  id: string;
  full_name: string;
  university: string;
  avg_rating: number | null;
  review_count: number;
}

export interface Skill {
  id: string;
  owner_id: string;
  title: string;
  description: string;
  category: string;
  level: SkillLevel;
  mode: SkillMode;
  kind: SkillKind;
  hours_estimate: number | null;
  tags: string[];
  created_at: string;
  owner: OwnerSummary;
}

export interface SkillInput {
  title: string;
  description: string;
  category: string;
  level: SkillLevel;
  mode: SkillMode;
  kind: SkillKind;
  hours_estimate: number | null;
  tags: string[];
}

export interface SkillFilters {
  search?: string;
  category?: string;
  level?: SkillLevel | '';
  mode?: SkillMode | '';
  kind?: SkillKind | '';
  ownerId?: string;
  sort?: SortKey;
}

export interface ExchangeRequest {
  id: string;
  skill_id: string;
  skill_title: string;
  requester_id: string;
  requester_name: string;
  owner_id: string;
  owner_name: string;
  message: string;
  offered_in_return: string;
  status: RequestStatus;
  created_at: string;
  updated_at: string;
  reviewed_by_me: boolean;
}

export interface RequestInput {
  skill_id: string;
  message: string;
  offered_in_return: string;
}

export interface Review {
  id: string;
  request_id: string;
  reviewer_id: string;
  reviewer_name: string;
  reviewee_id: string;
  rating: number;
  comment: string;
  created_at: string;
}

export interface ReviewInput {
  request_id: string;
  rating: number;
  comment: string;
}
