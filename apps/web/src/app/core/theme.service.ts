import { Injectable, signal } from '@angular/core';

export type ThemePreference = 'system' | 'light' | 'dark';

const STORAGE_KEY = 'theme-preference';

// Three-way preference (not just light/dark): "system" follows the phone/OS setting via
// prefers-color-scheme (see styles.css), and only "light"/"dark" write a data-theme
// attribute that overrides it — matching what the user asked for ("o usuário podendo
// escolher e também ser de acordo com o celular do usuário"). With nothing stored the app
// starts dark ("tema dark por default"); index.html sets data-theme="dark" up front so the
// first paint is already dark.
@Injectable({ providedIn: 'root' })
export class ThemeService {
  readonly preference = signal<ThemePreference>(this.readStoredPreference());

  constructor() {
    this.applyToDocument(this.preference());

    // Live-update while in "system" mode if the OS theme changes while the app is open.
    window.matchMedia?.('(prefers-color-scheme: dark)').addEventListener('change', () => {
      if (this.preference() === 'system') {
        this.applyToDocument('system');
      }
    });
  }

  setPreference(preference: ThemePreference): void {
    this.preference.set(preference);
    localStorage.setItem(STORAGE_KEY, preference);
    this.applyToDocument(preference);
  }

  // Cycles Sistema -> Claro -> Escuro -> Sistema, driven by a single header button.
  cycle(): void {
    const order: ThemePreference[] = ['system', 'light', 'dark'];
    const next = order[(order.indexOf(this.preference()) + 1) % order.length];
    this.setPreference(next);
  }

  private applyToDocument(preference: ThemePreference): void {
    const root = document.documentElement;
    if (preference === 'system') {
      root.removeAttribute('data-theme');
    } else {
      root.setAttribute('data-theme', preference);
    }
  }

  private readStoredPreference(): ThemePreference {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored === 'light' || stored === 'dark' || stored === 'system') {
        return stored;
      }
    } catch {
      // localStorage unavailable (private mode, etc.) — fall back to the default.
    }
    return 'dark';
  }
}
