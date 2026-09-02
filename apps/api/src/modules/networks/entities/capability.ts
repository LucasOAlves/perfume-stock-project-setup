// Grantable capabilities per docs/product/domain-model.md and ADR-003.
// member.manage and permission.manage are intentionally NOT in this list —
// they are hardcoded to is_owner and must never become a capability grant.
export const CAPABILITIES = [
  "inventory.read",
  "reservation.create",
  "reservation.cancel.own",
  "reservation.cancel.any",
  "inventory.adjust",
  "product.manage",
  "audit.read"
] as const;

export type Capability = (typeof CAPABILITIES)[number];

// Granted automatically to every new non-owner membership (least privilege by default).
export const DEFAULT_MEMBER_CAPABILITIES: Capability[] = [
  "inventory.read",
  "reservation.create",
  "reservation.cancel.own"
];

// Portuguese labels for error messages shown to real users (see membership-guard.ts).
// Keep in sync with apps/web/src/app/core/models.ts CAPABILITY_LABELS.
export const CAPABILITY_LABELS: Record<Capability, string> = {
  "inventory.read": "Ver estoque",
  "reservation.create": "Criar reservas",
  "reservation.cancel.own": "Cancelar as próprias reservas",
  "reservation.cancel.any": "Cancelar reservas de qualquer pessoa",
  "inventory.adjust": "Alterar quantidade em estoque",
  "product.manage": "Criar e editar produtos",
  "audit.read": "Ver histórico de movimentações"
};
