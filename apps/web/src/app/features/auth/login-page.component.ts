import { Component, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { ApiService } from '../../core/api.service';
import { AuthService } from '../../core/auth.service';
import { extractErrorMessage } from '../../core/error-message';

type Step = 'email' | 'code';

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

@Component({
  selector: 'app-login-page',
  standalone: true,
  imports: [FormsModule],
  template: `
    <h1>Entrar</h1>
    <p>Digite seu e-mail para receber um código de acesso.</p>

    @if (errorMessage()) {
      <div class="error-banner">{{ errorMessage() }}</div>
    }

    @if (step() === 'email') {
      <form (ngSubmit)="requestCode()">
        <div class="field">
          <label for="email">E-mail</label>
          <input
            id="email"
            name="email"
            type="email"
            placeholder="voce@exemplo.com"
            [(ngModel)]="email"
            required
            autocomplete="email"
          />
        </div>
        <button type="submit" class="btn-primary" [disabled]="loading()">
          {{ loading() ? 'Enviando…' : 'Enviar código' }}
        </button>
      </form>
    } @else {
      <form (ngSubmit)="verifyCode()">
        <div class="field">
          <label for="displayName">Como podemos te chamar?</label>
          <input id="displayName" name="displayName" type="text" [(ngModel)]="displayName" autocomplete="name" />
        </div>
        <div class="field">
          <label for="code">Código recebido</label>
          <input
            id="code"
            name="code"
            type="text"
            inputmode="numeric"
            maxlength="6"
            [(ngModel)]="code"
            required
            autocomplete="one-time-code"
          />
        </div>
        <button type="submit" class="btn-primary" [disabled]="loading()">
          {{ loading() ? 'Confirmando…' : 'Confirmar' }}
        </button>
        <button type="button" class="link-button" (click)="step.set('email')">Usar outro e-mail</button>
      </form>
    }
  `
})
export class LoginPageComponent {
  readonly step = signal<Step>('email');
  readonly loading = signal(false);
  readonly errorMessage = signal<string | null>(null);

  email = '';
  code = '';
  displayName = '';

  constructor(
    private readonly api: ApiService,
    private readonly auth: AuthService,
    private readonly router: Router
  ) {}

  async requestCode(): Promise<void> {
    this.errorMessage.set(null);
    if (!EMAIL_PATTERN.test(this.email.trim())) {
      this.errorMessage.set('Informe um e-mail válido.');
      return;
    }
    this.loading.set(true);
    try {
      await this.api.requestOtp(this.email.trim());
      this.step.set('code');
    } catch (err) {
      this.errorMessage.set(extractErrorMessage(err, 'Não foi possível enviar o código. Tente novamente.'));
    } finally {
      this.loading.set(false);
    }
  }

  async verifyCode(): Promise<void> {
    this.errorMessage.set(null);
    this.loading.set(true);
    try {
      const { user } = await this.api.verifyOtp(
        this.email.trim(),
        this.code.trim(),
        this.displayName.trim() || undefined
      );
      this.auth.setCurrentUser(user);
      await this.router.navigateByUrl('/networks');
    } catch (err) {
      this.errorMessage.set(extractErrorMessage(err, 'Código inválido ou expirado.'));
    } finally {
      this.loading.set(false);
    }
  }
}
