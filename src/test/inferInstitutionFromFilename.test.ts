import { describe, it, expect } from "vitest";
import {
  inferInstitutionFromFilename,
  matchInstitutionToHousehold,
  type InferredInstitution,
} from "@/services/inferInstitutionFromFilename";

describe("inferInstitutionFromFilename", () => {
  it("returns account for itau filename", () => {
    const r = inferInstitutionFromFilename("itau_2025-02.csv");
    expect(r).not.toBeNull();
    expect(r!.kind).toBe("account");
    expect(r!.name).toBe("itau");
  });

  it("returns account for itaú with accent", () => {
    const r = inferInstitutionFromFilename("extrato_itaú_fev.csv");
    expect(r).not.toBeNull();
    expect(r!.name).toBe("itau");
  });

  it("returns card for nubank fatura", () => {
    const r = inferInstitutionFromFilename("nubank_fatura_marco.csv");
    expect(r).not.toBeNull();
    expect(r!.kind).toBe("card");
    expect(r!.name).toBe("nubank");
  });

  it("returns account for extrato-santander", () => {
    const r = inferInstitutionFromFilename("extrato-santander.csv");
    expect(r).not.toBeNull();
    expect(r!.kind).toBe("account");
    expect(r!.name).toBe("santander");
  });

  it("returns account for BB/banco do brasil", () => {
    const r = inferInstitutionFromFilename("bb_extrato_2025.csv");
    expect(r).not.toBeNull();
    expect(r!.name).toBe("banco do brasil");
  });

  it("returns card when filename contains fatura", () => {
    const r = inferInstitutionFromFilename("nubank_fatura_marco.csv");
    expect(r?.kind).toBe("card");
  });

  it("returns card when filename contains cartão", () => {
    const r = inferInstitutionFromFilename("itau_cartao_credito.csv");
    expect(r).not.toBeNull();
    expect(r!.kind).toBe("card");
  });

  it("returns null for empty or invalid", () => {
    expect(inferInstitutionFromFilename("")).toBeNull();
    expect(inferInstitutionFromFilename("   ")).toBeNull();
    // @ts-expect-error test invalid input
    expect(inferInstitutionFromFilename(null)).toBeNull();
  });

  it("returns first word as name when no alias matches", () => {
    const r = inferInstitutionFromFilename("xyz_bank_extrato.csv");
    expect(r).not.toBeNull();
    expect(r!.name).toBe("xyz");
    expect(r!.kind).toBe("account");
  });

  it("strips extension and normalizes", () => {
    const r = inferInstitutionFromFilename("Inter_Extrato_01-2025.CSV");
    expect(r).not.toBeNull();
    expect(r!.name).toBe("inter");
  });
});

describe("matchInstitutionToHousehold", () => {
  const accounts = [
    { id: "acc-itau", name: "Itaú" },
    { id: "acc-nu", name: "Nubank" },
    { id: "acc-santander", name: "Santander" },
  ];
  const cards = [
    { id: "card-nu", name: "Nubank" },
    { id: "card-itau", name: "Itaú Cartão" },
  ];

  it("matches single account (Itaú)", () => {
    const inferred: InferredInstitution = { kind: "account", name: "itau" };
    const r = matchInstitutionToHousehold(inferred, accounts, cards);
    expect(r.confidence).toBe("high");
    expect(r.accountId).toBe("acc-itau");
    expect(r.matchedName).toBe("Itaú");
  });

  it("matches single card when kind is card", () => {
    const inferred: InferredInstitution = { kind: "card", name: "nubank" };
    const r = matchInstitutionToHousehold(inferred, [], cards);
    expect(r.confidence).toBe("high");
    expect(r.cardId).toBe("card-nu");
    expect(r.matchedName).toBe("Nubank");
  });

  it("returns none when no match", () => {
    const inferred: InferredInstitution = { kind: "account", name: "bradesco" };
    const r = matchInstitutionToHousehold(inferred, accounts, cards);
    expect(r.confidence).toBe("none");
    expect(r.accountId).toBeUndefined();
    expect(r.cardId).toBeUndefined();
  });

  it("returns none when inferred is null", () => {
    const r = matchInstitutionToHousehold(null, accounts, cards);
    expect(r.confidence).toBe("none");
  });

  it("if filename contains itau and account Itaú exists, match is high with accountId", () => {
    const inferred = inferInstitutionFromFilename("itau_extrato_fev.csv");
    expect(inferred).not.toBeNull();
    const r = matchInstitutionToHousehold(inferred!, accounts, cards);
    expect(r.confidence).toBe("high");
    expect(r.accountId).toBe("acc-itau");
  });

  it("if filename is nubank_fatura and card Nubank exists, match is high with cardId", () => {
    const inferred = inferInstitutionFromFilename("nubank_fatura_marco.csv");
    expect(inferred).not.toBeNull();
    const r = matchInstitutionToHousehold(inferred!, accounts, cards);
    expect(r.confidence).toBe("high");
    expect(r.cardId).toBe("card-nu");
  });

  it("when no account/card exists, confidence is none", () => {
    const inferred = inferInstitutionFromFilename("itau_extrato_fev.csv");
    const r = matchInstitutionToHousehold(inferred!, [], []);
    expect(r.confidence).toBe("none");
    expect(r.accountId).toBeUndefined();
  });
});
