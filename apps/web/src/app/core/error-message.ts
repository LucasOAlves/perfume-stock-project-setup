import { HttpErrorResponse } from '@angular/common/http';

// The API already returns only safe, typed error messages (see
// docs/architecture/security-model.md) — this just unwraps the envelope and falls back
// to a generic message on network failure so the UI never shows a raw stack trace.
export function extractErrorMessage(err: unknown, fallback: string): string {
  if (err instanceof HttpErrorResponse) {
    const body = err.error as { error?: { message?: string } } | undefined;
    if (body?.error?.message) {
      return body.error.message;
    }
  }
  return fallback;
}
