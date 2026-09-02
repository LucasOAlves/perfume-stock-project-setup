// Hand-rolled instead of a library (e.g. ngx-mask): this is the only masked input in
// the whole app, so a ~15-line formatter is less overhead than a new runtime dependency
// for one field — matches this project's existing bias against adding libraries for
// narrow, single-use needs (see .agents/angular-frontend-expert.md — no state library,
// no heavy UI kit). If a second masked field shows up later, extract a directive then.
export interface PhoneRegion {
  dialCode: string;
  flag: string;
  label: string;
}

// Brazil only for now — target users are Brazilian resellers (docs/product/product-spec.md).
// Modeled as a list so adding a country later is a data change, not a form rewrite.
export const PHONE_REGIONS: PhoneRegion[] = [{ dialCode: '+55', flag: '🇧🇷', label: 'Brasil' }];

// Formats raw digits as a Brazilian phone number while typing: mobile numbers (11
// digits, DDD + 9-digit number) as "(11) 99999-9999", landlines (10 digits) as
// "(11) 9999-9999". Never includes the country code — that's a separate region picker.
export function formatBrazilPhone(digits: string): string {
  const trimmed = digits.slice(0, 11);
  if (trimmed.length === 0) return '';
  if (trimmed.length <= 2) return `(${trimmed}`;
  const ddd = trimmed.slice(0, 2);
  const rest = trimmed.slice(2);
  if (trimmed.length <= 6) return `(${ddd}) ${rest}`;
  if (trimmed.length <= 10) return `(${ddd}) ${rest.slice(0, 4)}-${rest.slice(4)}`;
  return `(${ddd}) ${rest.slice(0, 5)}-${rest.slice(5)}`;
}
