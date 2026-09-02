import { Component } from '@angular/core';
import { RouterLink, RouterOutlet } from '@angular/router';
import { AuthService } from './core/auth.service';
import { ThemeService } from './core/theme.service';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [RouterOutlet, RouterLink],
  template: `
    <header class="app-header">
      <a routerLink="/networks" class="brand">Estoque Vivo</a>
      <div class="header-actions">
        <button
          type="button"
          class="theme-toggle"
          (click)="theme.cycle()"
          [attr.aria-label]="themeLabel()"
          [title]="themeLabel()"
        >
          {{ themeIcon() }}
        </button>
        @if (auth.currentUser(); as user) {
          <div class="header-user">
            <span>{{ user.displayName }}</span>
            <button type="button" class="link-button" (click)="logout()">Sair</button>
          </div>
        }
      </div>
    </header>
    <main class="app-main">
      <router-outlet />
    </main>
  `,
  styles: [
    `
      .app-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 0.75rem 1rem;
        border-bottom: 1px solid var(--color-border);
        background: var(--color-surface);
      }
      .brand {
        font-weight: 700;
        font-size: 1.1rem;
        color: var(--color-primary);
        text-decoration: none;
      }
      .header-actions {
        display: flex;
        align-items: center;
        gap: 0.75rem;
      }
      .theme-toggle {
        background: transparent;
        border: 1px solid var(--color-border);
        border-radius: 999px;
        width: 40px;
        height: 40px;
        min-height: 40px;
        padding: 0;
        font-size: 1.1rem;
        line-height: 1;
        color: var(--color-text);
      }
      .theme-toggle:hover {
        background: var(--color-primary-soft-bg);
      }
      .header-user {
        display: flex;
        align-items: center;
        gap: 0.75rem;
        font-size: 0.9rem;
      }
      .app-main {
        max-width: 640px;
        margin: 0 auto;
        padding: 1rem;
      }
    `
  ]
})
export class AppComponent {
  constructor(
    readonly auth: AuthService,
    readonly theme: ThemeService
  ) {
    void this.auth.loadCurrentUser();
  }

  themeIcon(): string {
    switch (this.theme.preference()) {
      case 'light':
        return '☀️';
      case 'dark':
        return '🌙';
      default:
        return '🖥️';
    }
  }

  themeLabel(): string {
    switch (this.theme.preference()) {
      case 'light':
        return 'Tema: claro (toque para alternar)';
      case 'dark':
        return 'Tema: escuro (toque para alternar)';
      default:
        return 'Tema: automático (do celular) — toque para alternar';
    }
  }

  async logout(): Promise<void> {
    await this.auth.logout();
    window.location.href = '/login';
  }
}
