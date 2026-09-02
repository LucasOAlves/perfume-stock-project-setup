import { Component, OnInit, signal } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { ApiService } from '../../core/api.service';
import { extractErrorMessage } from '../../core/error-message';
import { CAPABILITY_LABELS, GRANTABLE_CAPABILITIES, type Capability, type Member } from '../../core/models';

// Owner-only screen. Every mutation here is re-checked server-side (requireOwner — see
// apps/api/src/modules/networks/networks.service.ts) — this page hiding itself from a
// non-owner is UX only, not the actual security boundary (.agents/angular-frontend-expert.md).
@Component({
  selector: 'app-members-page',
  standalone: true,
  imports: [RouterLink],
  template: `
    <a class="back-link" [routerLink]="['/networks', networkId, 'products']">← Voltar ao estoque</a>
    <h1>Membros e permissões</h1>

    @if (errorMessage()) {
      <div class="error-banner">{{ errorMessage() }}</div>
    }

    @if (loading()) {
      <p>Carregando…</p>
    } @else {
      @for (member of members(); track member.id) {
        <div class="card member-card">
          <div class="member-header">
            <strong>{{ member.displayName }}</strong>
            @if (member.isOwner) {
              <span class="tag">Dono</span>
            }
          </div>

          @if (!member.isOwner) {
            <div class="capabilities-list">
              @for (capability of capabilities; track capability) {
                <label class="capability-toggle">
                  <input
                    type="checkbox"
                    [checked]="isGranted(member.id, capability)"
                    (change)="toggle(member.id, capability, $event)"
                  />
                  {{ labelFor(capability) }}
                </label>
              }
            </div>
            <button
              type="button"
              class="btn-secondary save-btn"
              [disabled]="savingMemberId() === member.id"
              (click)="save(member.id)"
            >
              {{ savingMemberId() === member.id ? 'Salvando…' : 'Salvar permissões' }}
            </button>
          }
        </div>
      }
    }
  `,
  styles: [
    `
      .back-link {
        display: inline-block;
        margin-bottom: 0.75rem;
        color: var(--color-primary);
        text-decoration: none;
        font-size: 0.9rem;
      }
      .member-header {
        display: flex;
        align-items: center;
        gap: 0.5rem;
        margin-bottom: 0.5rem;
      }
      .capabilities-list {
        display: flex;
        flex-direction: column;
        gap: 0.4rem;
        margin-bottom: 0.75rem;
      }
      .capability-toggle {
        display: flex;
        align-items: center;
        gap: 0.5rem;
        font-weight: 400;
        font-size: 0.9rem;
      }
      .capability-toggle input {
        width: auto;
      }
      .save-btn {
        width: auto;
      }
    `
  ]
})
export class MembersPageComponent implements OnInit {
  networkId = '';
  readonly members = signal<Member[]>([]);
  readonly loading = signal(true);
  readonly savingMemberId = signal<string | null>(null);
  readonly errorMessage = signal<string | null>(null);

  capabilities = GRANTABLE_CAPABILITIES;
  private grantedByMember = new Map<string, Set<Capability>>();

  constructor(
    private readonly api: ApiService,
    private readonly route: ActivatedRoute
  ) {}

  async ngOnInit(): Promise<void> {
    this.networkId = this.route.snapshot.paramMap.get('networkId') ?? '';
    await this.load();
  }

  private async load(): Promise<void> {
    this.loading.set(true);
    try {
      const { members } = await this.api.listMembers(this.networkId);
      this.members.set(members);

      await Promise.all(
        members
          .filter((m) => !m.isOwner)
          .map(async (m) => {
            try {
              const { capabilities } = await this.api.getMemberCapabilities(this.networkId, m.id);
              this.grantedByMember.set(m.id, new Set(capabilities));
            } catch {
              this.grantedByMember.set(m.id, new Set());
            }
          })
      );
    } catch (err) {
      this.errorMessage.set(extractErrorMessage(err, 'Não foi possível carregar os membros.'));
    } finally {
      this.loading.set(false);
    }
  }

  isGranted(membershipId: string, capability: Capability): boolean {
    return this.grantedByMember.get(membershipId)?.has(capability) ?? false;
  }

  toggle(membershipId: string, capability: Capability, event: Event): void {
    const checked = (event.target as HTMLInputElement).checked;
    const set = this.grantedByMember.get(membershipId) ?? new Set<Capability>();
    if (checked) {
      set.add(capability);
    } else {
      set.delete(capability);
    }
    this.grantedByMember.set(membershipId, set);
  }

  labelFor(capability: Capability): string {
    return CAPABILITY_LABELS[capability];
  }

  async save(membershipId: string): Promise<void> {
    this.savingMemberId.set(membershipId);
    this.errorMessage.set(null);
    try {
      const capabilities = [...(this.grantedByMember.get(membershipId) ?? new Set<Capability>())];
      const { capabilities: saved } = await this.api.setMemberCapabilities(this.networkId, membershipId, capabilities);
      this.grantedByMember.set(membershipId, new Set(saved));
    } catch (err) {
      this.errorMessage.set(extractErrorMessage(err, 'Não foi possível salvar as permissões.'));
    } finally {
      this.savingMemberId.set(null);
    }
  }
}
