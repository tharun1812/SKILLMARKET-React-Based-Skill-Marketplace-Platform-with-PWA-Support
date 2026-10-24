import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { LocalService } from './localService';
import type { Service } from './service';
import { SupabaseService } from './supabaseService';

export interface BackendEnv {
  VITE_SUPABASE_URL?: string;
  VITE_SUPABASE_ANON_KEY?: string;
}

export function hasSupabaseConfig(env: BackendEnv): boolean {
  return Boolean(env.VITE_SUPABASE_URL?.trim() && env.VITE_SUPABASE_ANON_KEY?.trim());
}

/** Uses Supabase when both environment variables are set, otherwise the local demo backend. */
export function createService(env: BackendEnv = import.meta.env as BackendEnv): Service {
  if (hasSupabaseConfig(env)) {
    const client: SupabaseClient = createClient(env.VITE_SUPABASE_URL!.trim(), env.VITE_SUPABASE_ANON_KEY!.trim(), {
      auth: { persistSession: true, autoRefreshToken: true },
    });
    return new SupabaseService(client);
  }
  return new LocalService();
}
