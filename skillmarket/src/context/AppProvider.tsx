import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import type { Service } from '../lib/service';
import type { AuthUser, Profile } from '../lib/types';
import { AppContext, type AppState } from './appContext';

export default function AppProvider({ service, children }: { service: Service; children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let active = true;
    service.getSession().then((u) => {
      if (!active) return;
      setUser(u);
      setReady(true);
    }).catch(() => active && setReady(true));
    const off = service.onAuthChange((u) => active && setUser(u));
    return () => { active = false; off(); };
  }, [service]);

  const userId = user?.id ?? null;
  const refreshProfile = useCallback(async () => {
    if (!userId) { setProfile(null); return; }
    try { setProfile(await service.getProfile(userId)); } catch { setProfile(null); }
  }, [service, userId]);

  useEffect(() => {
    let active = true;
    if (!userId) { setProfile(null); return; }
    service.getProfile(userId).then((p) => active && setProfile(p)).catch(() => active && setProfile(null));
    return () => { active = false; };
  }, [service, userId]);

  const value = useMemo<AppState>(() => ({
    service, user, profile, ready, refreshProfile,
    async signIn(email, password) { setUser(await service.signIn(email, password)); },
    async signUp(email, password, fullName) {
      const result = await service.signUp(email, password, fullName);
      if (result.user && !result.needsConfirmation) setUser(result.user);
      return result;
    },
    async signOut() { await service.signOut(); setUser(null); },
  }), [service, user, profile, ready, refreshProfile]);

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}
