import { ServiceError } from '../lib/service';

export function errorMessage(e: unknown): string {
  if (e instanceof ServiceError || e instanceof Error) return e.message;
  return 'Something went wrong. Please try again.';
}

export function fieldErrors(e: unknown): Record<string, string> {
  return e instanceof ServiceError && e.fields ? e.fields : {};
}
