import { useContext } from 'react';
import { AppContext, type AppState } from './appContext';

export function useApp(): AppState {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error('useApp must be used inside <AppProvider>');
  return ctx;
}
