import type { HttpInterceptorFn } from '@angular/common/http';

const MUTATING_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

function readCookie(name: string): string | null {
  const match = document.cookie.match(new RegExp(`(?:^|; )${name}=([^;]*)`));
  return match ? decodeURIComponent(match[1]) : null;
}

// Sends the session cookie on every API call and attaches the CSRF token header on
// state-changing requests, matching the server's double-submit-style check
// (apps/api/src/shared/auth-plugin.ts). See ADR-004 / security-model.md.
export const credentialsInterceptor: HttpInterceptorFn = (req, next) => {
  let cloned = req.clone({ withCredentials: true });

  if (MUTATING_METHODS.has(req.method)) {
    const csrfToken = readCookie('csrf_token');
    if (csrfToken) {
      cloned = cloned.clone({ setHeaders: { 'x-csrf-token': csrfToken } });
    }
  }

  return next(cloned);
};
