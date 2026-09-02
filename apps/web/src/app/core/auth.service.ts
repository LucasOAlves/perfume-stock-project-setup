import { Injectable, signal } from '@angular/core';
import { ApiService } from './api.service';
import type { CurrentUser } from './models';

// Server is the source of truth for identity — this service only caches what /auth/me
// last returned. See .agents/angular-frontend-expert.md "server as source of truth".
@Injectable({ providedIn: 'root' })
export class AuthService {
  readonly currentUser = signal<CurrentUser | null>(null);
  readonly initialized = signal(false);

  constructor(private readonly api: ApiService) {}

  async loadCurrentUser(): Promise<void> {
    try {
      const { user } = await this.api.me();
      this.currentUser.set(user);
    } catch {
      this.currentUser.set(null);
    } finally {
      this.initialized.set(true);
    }
  }

  async logout(): Promise<void> {
    await this.api.logout();
    this.currentUser.set(null);
  }

  setCurrentUser(user: CurrentUser): void {
    this.currentUser.set(user);
  }
}
