import type {
  AuthUser, ExchangeRequest, Profile, ProfilePatch, RequestInput, RequestStatus, Review, ReviewInput,
  SignUpResult, Skill, SkillFilters, SkillInput,
} from './types';

export type ErrorCode =
  | 'validation' | 'unauthenticated' | 'forbidden' | 'not_found' | 'conflict'
  | 'invalid_transition' | 'auth' | 'network' | 'unknown';

export class ServiceError extends Error {
  constructor(public code: ErrorCode, message: string, public fields?: Record<string, string>) {
    super(message);
    this.name = 'ServiceError';
  }
}

/** Everything the UI needs from a backend. Two implementations: LocalService (demo) and SupabaseService. */
export interface Service {
  readonly mode: 'local' | 'supabase';

  getSession(): Promise<AuthUser | null>;
  signUp(email: string, password: string, fullName: string): Promise<SignUpResult>;
  signIn(email: string, password: string): Promise<AuthUser>;
  signOut(): Promise<void>;
  onAuthChange(callback: (user: AuthUser | null) => void): () => void;

  getProfile(id: string): Promise<Profile>;
  updateProfile(patch: ProfilePatch): Promise<Profile>;

  listSkills(filters?: SkillFilters): Promise<Skill[]>;
  getSkill(id: string): Promise<Skill>;
  createSkill(input: SkillInput): Promise<Skill>;
  updateSkill(id: string, input: SkillInput): Promise<Skill>;
  deleteSkill(id: string): Promise<void>;

  createRequest(input: RequestInput): Promise<ExchangeRequest>;
  listRequests(): Promise<{ incoming: ExchangeRequest[]; outgoing: ExchangeRequest[] }>;
  setRequestStatus(id: string, status: RequestStatus): Promise<ExchangeRequest>;

  createReview(input: ReviewInput): Promise<Review>;
  listReviewsFor(userId: string): Promise<Review[]>;
}
