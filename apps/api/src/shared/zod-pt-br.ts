import { z, ZodIssueCode, type ZodErrorMap } from "zod";

// Without this, every Zod schema across the API (identity, networks, catalog,
// inventory, reservations routes) falls back to Zod's built-in English messages
// ("String must contain at least 1 character(s)", "Required", "Invalid uuid" ...),
// which reach the browser as-is (see app.ts's error handler — a ZodError's issue
// messages become the client-visible ValidationError text) and silently override
// every Portuguese fallback string in the Angular app. One global error map here
// is far less error-prone than adding a custom message to every individual
// `.min()`/`.max()`/`.uuid()` call across every route schema in the codebase.
const portugueseErrorMap: ZodErrorMap = (issue, ctx) => {
  switch (issue.code) {
    case ZodIssueCode.invalid_type:
      if (issue.received === "undefined") {
        return { message: "Campo obrigatório" };
      }
      return { message: `Tipo inválido: esperado ${issue.expected}` };
    case ZodIssueCode.too_small:
      if (issue.type === "string") {
        return issue.minimum === 1
          ? { message: "Campo obrigatório" }
          : { message: `Deve ter pelo menos ${issue.minimum} caractere(s)` };
      }
      if (issue.type === "number") {
        return { message: `Deve ser maior ou igual a ${issue.minimum}` };
      }
      if (issue.type === "array") {
        return { message: `Deve ter pelo menos ${issue.minimum} item(ns)` };
      }
      return { message: "Valor muito pequeno" };
    case ZodIssueCode.too_big:
      if (issue.type === "string") {
        return { message: `Deve ter no máximo ${issue.maximum} caractere(s)` };
      }
      if (issue.type === "number") {
        return { message: `Deve ser menor ou igual a ${issue.maximum}` };
      }
      return { message: "Valor muito grande" };
    case ZodIssueCode.invalid_string:
      if (issue.validation === "uuid") return { message: "Identificador inválido" };
      if (issue.validation === "url") return { message: "URL inválida" };
      if (issue.validation === "email") return { message: "E-mail inválido" };
      return { message: "Texto em formato inválido" };
    case ZodIssueCode.invalid_enum_value:
      return { message: `Valor inválido — opções aceitas: ${issue.options.join(", ")}` };
    case ZodIssueCode.custom:
      return { message: issue.message ?? "Valor inválido" };
    default:
      return { message: ctx.defaultError };
  }
};

export function installPortugueseZodErrorMap(): void {
  z.setErrorMap(portugueseErrorMap);
}
