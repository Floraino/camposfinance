import { supabase } from "@/integrations/supabase/client";
import type { CategoryType } from "@/components/ui/CategoryBadge";

/**
 * Categorize a single description using the edge function.
 * Uses supabase.functions.invoke (sends session token automatically).
 * Falls back to local keyword matching if edge function is unavailable.
 */
export async function categorizeDescription(description: string): Promise<CategoryType> {
  if (!description || description.length < 3) {
    return "other";
  }

  // Local keyword matching first (fast path, works without Edge Function)
  const localResult = localCategorize(description);
  if (localResult !== "other") return localResult;

  try {
    const { data, error } = await supabase.functions.invoke("categorize-transaction", {
      body: { description },
    });

    if (error) {
      console.warn("[categorize] Edge function error (using local fallback):", error.message);
      return "other";
    }

    return (data?.category as CategoryType) || "other";
  } catch (err) {
    console.warn("[categorize] Network error (using local fallback):", err);
    return "other";
  }
}

// Local keyword matching (runs without backend)
const LOCAL_KEYWORDS: Record<string, CategoryType> = {
  mercado: "food", supermercado: "food", restaurante: "food", lanche: "food",
  padaria: "food", ifood: "food", "uber eats": "food", delivery: "food",
  açougue: "food", feira: "food", almoço: "food", jantar: "food", café: "food",
  uber: "transport", "99": "transport", gasolina: "transport", combustível: "transport",
  estacionamento: "transport", pedágio: "transport", ônibus: "transport",
  luz: "bills", água: "bills", internet: "bills", telefone: "bills",
  aluguel: "bills", condomínio: "bills", energia: "bills", celular: "bills",
  farmácia: "health", médico: "health", hospital: "health", dentista: "health",
  plano: "health", drogaria: "health", academia: "health",
  escola: "education", faculdade: "education", curso: "education", livro: "education",
  roupa: "shopping", sapato: "shopping", loja: "shopping", amazon: "shopping",
  "mercado livre": "shopping", magazine: "shopping", shopping: "shopping",
  cinema: "leisure", netflix: "leisure", spotify: "leisure", disney: "leisure",
  viagem: "leisure", hotel: "leisure", bar: "leisure", show: "leisure",
};

function localCategorize(description: string): CategoryType {
  const lower = description.toLowerCase();
  for (const [keyword, category] of Object.entries(LOCAL_KEYWORDS)) {
    if (lower.includes(keyword)) return category;
  }
  return "other";
}

export async function categorizeAllTransactions(householdId?: string): Promise<{ updated: number; errors: string[] }> {
  if (!householdId) {
    console.warn("[categorizeAll] householdId não fornecido — abortando para evitar data leak");
    return { updated: 0, errors: ["householdId é obrigatório"] };
  }

  // Get all transactions with 'other' category or uncategorized — SCOPED to household
  const { data: transactions, error } = await supabase
    .from("transactions")
    .select("id, description, category")
    .eq("household_id", householdId)
    .eq("category", "other");

  if (error) throw error;
  if (!transactions || transactions.length === 0) {
    return { updated: 0, errors: [] };
  }

  // Try AI batch categorization first; fall back to local if edge function unavailable
  let categories: { id: string; category: string }[] = [];

  try {
    const { data: aiData, error: aiError } = await supabase.functions.invoke(
      "categorize-transaction",
      {
        body: {
          categorizeAll: true,
          descriptions: transactions.map((t) => ({ id: t.id, description: t.description })),
        },
      }
    );

    if (!aiError && aiData?.categories) {
      categories = aiData.categories;
    } else {
      console.warn("[categorizeAll] Edge function unavailable, using local fallback:", aiError?.message);
      categories = transactions.map((t) => ({
        id: t.id,
        category: localCategorize(t.description),
      }));
    }
  } catch (networkErr) {
    console.warn("[categorizeAll] Network error, using local fallback:", networkErr);
    categories = transactions.map((t) => ({
      id: t.id,
      category: localCategorize(t.description),
    }));
  }

  let updated = 0;
  const errors: string[] = [];

  // Update each transaction
  for (const cat of categories) {
    if (cat.category && cat.category !== "other") {
      const { error: updateError } = await supabase
        .from("transactions")
        .update({ category: cat.category })
        .eq("id", cat.id);

      if (updateError) {
        errors.push(`Erro ao atualizar ${cat.id}`);
      } else {
        updated++;
      }
    }
  }

  return { updated, errors };
}

export async function recategorizeAllTransactions(householdId?: string): Promise<{ updated: number; errors: string[] }> {
  if (!householdId) {
    console.warn("[recategorizeAll] householdId não fornecido — abortando para evitar data leak");
    return { updated: 0, errors: ["householdId é obrigatório"] };
  }


  // Get ALL transactions — SCOPED to household
  const { data: transactions, error } = await supabase
    .from("transactions")
    .select("id, description, category")
    .eq("household_id", householdId);

  if (error) throw error;
  if (!transactions || transactions.length === 0) {
    return { updated: 0, errors: [] };
  }

  // Try AI batch categorization; fall back to local if unavailable
  let categories: { id: string; category: string }[] = [];

  try {
    const { data: aiData, error: aiError } = await supabase.functions.invoke(
      "categorize-transaction",
      {
        body: {
          categorizeAll: true,
          descriptions: transactions.map((t) => ({ id: t.id, description: t.description })),
        },
      }
    );

    if (!aiError && aiData?.categories) {
      categories = aiData.categories;
    } else {
      console.warn("[recategorizeAll] Edge function unavailable, using local fallback:", aiError?.message);
      categories = transactions.map((t) => ({
        id: t.id,
        category: localCategorize(t.description),
      }));
    }
  } catch (networkErr) {
    console.warn("[recategorizeAll] Network error, using local fallback:", networkErr);
    categories = transactions.map((t) => ({
      id: t.id,
      category: localCategorize(t.description),
    }));
  }

  let updated = 0;
  const errors: string[] = [];

  // Update transactions where category changed
  for (const cat of categories) {
    const original = transactions.find((t) => t.id === cat.id);
    if (cat.category && original && cat.category !== original.category) {
      const { error: updateError } = await supabase
        .from("transactions")
        .update({ category: cat.category })
        .eq("id", cat.id);

      if (updateError) {
        errors.push(`Erro ao atualizar ${cat.id}`);
      } else {
        updated++;
      }
    }
  }

  return { updated, errors };
}
