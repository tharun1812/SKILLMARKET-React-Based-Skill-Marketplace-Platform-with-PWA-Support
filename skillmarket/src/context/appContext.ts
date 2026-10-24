import { createContext } from 'react';
import type { Service } from '../lib/service';
import type { AuthUser, Profile, SignUpResult } from '../lib/types';

export interface AppState {
  service: Service;
  user: AuthUser | null;
  /** The signed-in user's profile (for the display name), or null. */
  profile: Profile | null;
  /** False until the first session check has finished. */
  ready: boolean;
  signIn(email: string, password: string): Promise<void>;
  signUp(email: string, password: string, fullName: string): Promise<SignUpResult>;
  signOut(): Promise<void>;
  refreshProfile(): Promise<void>;
}

export const AppContext = createContext<AppState | null>(null);
