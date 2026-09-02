import { inject } from '@angular/core';
import { Router, type CanActivateFn } from '@angular/router';
import { AuthService } from './auth.service';

// UX-only gate — redirects to /login when no user is cached. Every real authorization
// decision still happens server-side per request; this guard never substitutes for that
// (.agents/angular-frontend-expert.md "Critical Rule").
export const authGuard: CanActivateFn = async () => {
  const auth = inject(AuthService);
  const router = inject(Router);

  if (!auth.initialized()) {
    await auth.loadCurrentUser();
  }

  if (auth.currentUser()) {
    return true;
  }

  return router.createUrlTree(['/login']);
};
