import { supabase } from "@/integrations/supabase/client";
import type { CategoryType } from "@/components/ui/CategoryBadge";

const CATEGORIZE_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/categorize-transaction`;

export async function categorizeDescription(description: string): Promise<CategoryType> {
  if (!description || description.length < 3) {
    return "other";
  }

  try {
    const response = await fetch(CATEGORIZE_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
      },
      body: JSON.stringify({ description }),
    });

    if (!response.ok) {
      return "other";
    }

    const data = await response.json();
    return (data.category as CategoryType) || "other";
  } catch (error) {
    console.error("Error categorizing:", error);
    return "other";
  }
}

export async function categorizeAllTransactions(): Promise<{ updated: number; errors: string[] }> {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) {
    throw new Error("Usuário não autenticado");
  }

  // Get all transactions with 'other' category or uncategorized
  const { data: transactions, error } = await supabase
    .from("transactions")
    .select("id, description, category")
    .eq("category", "other");

  if (error) throw error;
  if (!transactions || transactions.length === 0) {
    return { updated: 0, errors: [] };
  }

  // Send to AI for batch categorization
  const response = await fetch(CATEGORIZE_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${session.access_token}`,
    },
    body: JSON.stringify({
      categorizeAll: true,
      descriptions: transactions.map(t => ({ id: t.id, description: t.description })),
    }),
  });

  if (!response.ok) {
    throw new Error("Erro ao categorizar transações");
  }

  const data = await response.json();
  const categories: { id: string; category: string }[] = data.categories || [];

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

export async function recategorizeAllTransactions(): Promise<{ updated: number; errors: string[] }> {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) {
    throw new Error("Usuário não autenticado");
  }

  // Get ALL transactions
  const { data: transactions, error } = await supabase
    .from("transactions")
    .select("id, description, category");

  if (error) throw error;
  if (!transactions || transactions.length === 0) {
    return { updated: 0, errors: [] };
  }

  // Send to AI for batch categorization
  const response = await fetch(CATEGORIZE_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${session.access_token}`,
    },
    body: JSON.stringify({
      categorizeAll: true,
      descriptions: transactions.map(t => ({ id: t.id, description: t.description })),
    }),
  });

  if (!response.ok) {
    throw new Error("Erro ao categorizar transações");
  }

  const data = await response.json();
  const categories: { id: string; category: string }[] = data.categories || [];

  let updated = 0;
  const errors: string[] = [];

  // Update transactions where category changed
  for (const cat of categories) {
    const original = transactions.find(t => t.id === cat.id);
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
