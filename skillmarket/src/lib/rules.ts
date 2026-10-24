import type { ExchangeRequest, RequestStatus, Skill } from './types';

/** Who may move a request to which status. Mirrors the database trigger in supabase/migrations. */
export function canTransition(
  request: Pick<ExchangeRequest, 'status' | 'requester_id' | 'owner_id'>,
  next: RequestStatus,
  actorId: string,
): boolean {
  const { status, requester_id, owner_id } = request;
  if (status === 'pending' && (next === 'accepted' || next === 'declined')) return actorId === owner_id;
  if (status === 'pending' && next === 'cancelled') return actorId === requester_id;
  if (status === 'accepted' && (next === 'completed' || next === 'cancelled')) {
    return actorId === requester_id || actorId === owner_id;
  }
  return false;
}

export function availableActions(request: ExchangeRequest, actorId: string): RequestStatus[] {
  const all: RequestStatus[] = ['accepted', 'declined', 'cancelled', 'completed'];
  return all.filter((s) => canTransition(request, s, actorId));
}

export interface DashboardStats {
  offers: number;
  wants: number;
  incomingPending: number;
  outgoingPending: number;
  active: number;
  completed: number;
}

export function computeStats(mySkills: Skill[], incoming: ExchangeRequest[], outgoing: ExchangeRequest[]): DashboardStats {
  const all = [...incoming, ...outgoing];
  return {
    offers: mySkills.filter((s) => s.kind === 'offer').length,
    wants: mySkills.filter((s) => s.kind === 'want').length,
    incomingPending: incoming.filter((r) => r.status === 'pending').length,
    outgoingPending: outgoing.filter((r) => r.status === 'pending').length,
    active: all.filter((r) => r.status === 'accepted').length,
    completed: all.filter((r) => r.status === 'completed').length,
  };
}
