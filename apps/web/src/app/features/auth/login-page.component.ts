import { Component, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { ApiService } from '../../core/api.service';
import { AuthService } from '../../core/auth.service';
import { extractErrorMessage } from '../../core/error-message';
import { PHONE_REGIONS, formatBrazilPhone, type PhoneRegion } from '../../core/phone-format';

type Step = 'phone' | 'code';

// Only Brazil today (target users are Brazilian resellers — see docs/product/product-spec.md),
// but modeled as a region picker from day one so adding a second country later is a data
// change (PHONE_REGIONS in core/phone-format.ts), not a rewrite of this form.
@Component({
  selector: 'app-login-page',
  standalone: true,
  imports: [FormsModule],
  template: `
    <h1>Entrar</h1>
    <p>Digite seu telefone para receber um código de acesso.</p>

    @if (errorMessage()) {
      <div class="error-banner">{{ errorMessage() }}</div>
    }

    @if (step() === 'phone') {
      <form (ngSubmit)="requestCode()">
        <div class="field">
          <label for="region">País</label>
          <select id="region" name="region" [(ngModel)]="selectedDialCode">
            @for (region of regions; track region.dialCode) {
              <option [value]="region.dialCode">{{ region.flag }} {{ region.label }} ({{ region.dialCode }})</option>
            }
          </select>
        </div>
        <div class="field">
          <label for="phone">Telefone</label>
          <input
            id="phone"
            name="phone"
            type="tel"
            inputmode="numeric"
            placeholder="(11) 99999-9999"
            [value]="phoneDisplay"
            (input)="onPhoneInput($event)"
            required
            autocomplete="tel-national"
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
        <button type="button" class="link-button" (click)="step.set('phone')">Usar outro telefone</button>
      </form>
    }
  `
})
export class LoginPageComponent {
  readonly step = signal<Step>('phone');
  readonly loading = signal(false);
  readonly errorMessage = signal<string | null>(null);

  regions: PhoneRegion[] = PHONE_REGIONS;
  selectedDialCode = PHONE_REGIONS[0].dialCode;
  phoneDigits = '';
  phoneDisplay = '';

  code = '';
  displayName = '';

  constructor(
    private readonly api: ApiService,
    private readonly auth: AuthService,
    private readonly router: Router
  ) {}

  onPhoneInput(event: Event): void {
    const input = event.target as HTMLInputElement;
    this.phoneDigits = input.value.replace(/\D/g, '').slice(0, 11);
    this.phoneDisplay = formatBrazilPhone(this.phoneDigits);
    input.value = this.phoneDisplay;
  }

  private get e164Phone(): string {
    return `${this.selectedDialCode}${this.phoneDigits}`;
  }

  async requestCode(): Promise<void> {
    this.errorMessage.set(null);
    if (this.phoneDigits.length < 10) {
      this.errorMessage.set('Informe um telefone válido com DDD.');
      return;
    }
    this.loading.set(true);
    try {
      await this.api.requestOtp(this.e164Phone);
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
      const { user } = await this.api.verifyOtp(this.e164Phone, this.code.trim(), this.displayName.trim() || undefined);
      this.auth.setCurrentUser(user);
      await this.router.navigateByUrl('/networks');
    } catch (err) {
      this.errorMessage.set(extractErrorMessage(err, 'Código inválido ou expirado.'));
    } finally {
      this.loading.set(false);
    }
  }
}
