/**
 * Infers bank/account or card from CSV filename (pure, testable, offline).
 * Used to auto-link imported transactions to a household account or credit card.
 */

export type InferredInstitutionKind = "account" | "card";

export interface InferredInstitution {
  kind: InferredInstitutionKind;
  name: string; // normalized display name for matching (e.g. "itau", "nubank")
}

// Aliases: first is canonical name for matching; others are accepted in filename
const INSTITUTION_ALIASES: Record<string, string[]> = {
  itau: ["itau", "itaú", "itau unibanco"],
  nubank: ["nubank", "nu", "roxinho"],
  santander: ["santander"],
  "banco do brasil": ["bb", "banco do brasil", "banco do brasil bb"],
  bradesco: ["bradesco"],
  inter: ["inter", "banco inter"],
  caixa: ["caixa", "cef", "caixa economica"],
  picpay: ["picpay"],
  "mercado pago": ["mercadopago", "mercado pago", "mp"],
  c6: ["c6", "c6 bank", "c6bank"],
  nexo: ["nexo"],
  sicoob: ["sicoob"],
  sicredi: ["sicredi"],
};

// If filename contains any of these (after normalization), treat as card (fatura/cartão)
const CARD_KEYWORDS = ["fatura", "card", "cartao", "cartão", "credit", "credito", "crédito"];

function normalize(str: string): string {
  return str
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/[_\-.]+/g, " ")
    .trim();
}

function removeExtension(filename: string): string {
  return filename.replace(/\.(csv|txt)$/i, "").trim();
}

/**
 * Infers institution (bank/card) from filename.
 * Returns kind 'card' if filename suggests credit card (fatura, cartão, etc.); otherwise 'account'.
 */
export function inferInstitutionFromFilename(filename: string): InferredInstitution | null {
  if (!filename || typeof filename !== "string") return null;

  const withoutExt = removeExtension(filename);
  const normalized = normalize(withoutExt);

  if (normalized.length < 2) return null;

  // Check for card keywords first
  const isCard = CARD_KEYWORDS.some((kw) => normalized.includes(kw));

  // Find first matching institution by alias
  for (const [canonicalName, aliases] of Object.entries(INSTITUTION_ALIASES)) {
    const matches = aliases.some(
      (alias) => normalized.includes(alias) || normalized.includes(normalize(alias))
    );
    if (matches) {
      return {
        kind: isCard ? "card" : "account",
        name: canonicalName,
      };
    }
  }

  // No alias matched: use first "word" as potential name (e.g. "extrato-santander" -> santander already matched; "xyz_bank" -> "xyz")
  const parts = normalized.split(/\s+/).filter(Boolean);
  if (parts.length >= 1 && parts[0].length >= 2) {
    return {
      kind: isCard ? "card" : "account",
      name: parts[0],
    };
  }

  return null;
}

// ─── Matching to household accounts/cards ──────────────────────────────────

export interface AccountLike {
  id: string;
  name: string;
}

export interface CardLike {
  id: string;
  name: string;
}

export type MatchConfidence = "high" | "low" | "none";

export interface InstitutionMatchResult {
  accountId?: string | null;
  cardId?: string | null;
  confidence: MatchConfidence;
  matchedName?: string;
  /** When confidence is 'low', multiple accounts/cards matched */
  suggestedAccountIds?: string[];
  suggestedCardIds?: string[];
}

/**
 * Matches inferred institution name to household accounts or cards.
 * - Single strong match (name contains inferred or inferred contains name): high
 * - Multiple matches: low, return suggested ids without auto-applying
 * - No match: none
 */
export function matchInstitutionToHousehold(
  inferred: InferredInstitution | null,
  accounts: AccountLike[],
  cards: CardLike[]
): InstitutionMatchResult {
  if (!inferred || !inferred.name) {
    return { confidence: "none" };
  }

  const inferredNorm = normalize(inferred.name);

  if (inferred.kind === "card") {
    const matches = cards.filter((c) => {
      const nameNorm = normalize(c.name);
      return nameNorm.includes(inferredNorm) || inferredNorm.includes(nameNorm);
    });
    if (matches.length === 1) {
      return {
        cardId: matches[0].id,
        confidence: "high",
        matchedName: matches[0].name,
      };
    }
    if (matches.length > 1) {
      return {
        confidence: "low",
        suggestedCardIds: matches.map((m) => m.id),
        matchedName: matches.map((m) => m.name).join(", "),
      };
    }
    return { confidence: "none" };
  }

  // kind === 'account'
  const matches = accounts.filter((a) => {
    const nameNorm = normalize(a.name);
    return nameNorm.includes(inferredNorm) || inferredNorm.includes(nameNorm);
  });
  if (matches.length === 1) {
    return {
      accountId: matches[0].id,
      confidence: "high",
      matchedName: matches[0].name,
    };
  }
  if (matches.length > 1) {
    return {
      confidence: "low",
      suggestedAccountIds: matches.map((m) => m.id),
      matchedName: matches.map((m) => m.name).join(", "),
    };
  }
  return { confidence: "none" };
}
