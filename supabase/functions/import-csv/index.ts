import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface TransactionToImport {
  description: string;
  amount: number;
  category: string;
  payment_method: string;
  status: string;
  transaction_date: string;
  notes?: string;
  import_hash?: string;
}

interface ImportResult {
  imported: number;
  duplicates: number;
  failed: number;
  errors: { row: number; reason: string }[];
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const traceId = crypto.randomUUID().slice(0, 8);
    console.log(`[import-csv][${traceId}] Request received`);

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: "Não autorizado", code: "UNAUTHORIZED" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const supabaseKey = Deno.env.get("SUPABASE_ANON_KEY");
    
    if (!supabaseUrl || !supabaseKey) {
      console.error(`[import-csv][${traceId}] Missing SUPABASE_URL or SUPABASE_ANON_KEY`);
      return new Response(
        JSON.stringify({ error: "Configuração do servidor incompleta", code: "SERVER_MISCONFIGURED" }),
        { status: 503, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabase = createClient(supabaseUrl, supabaseKey, {
      global: { headers: { Authorization: authHeader } },
    });

    // Verify user
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return new Response(
        JSON.stringify({ error: "Usuário não autenticado" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { householdId, transactions, skipDuplicates = true } = await req.json();

    console.log(`[import-csv][${traceId}] User: ${user.id}`);

    if (!householdId) {
      return new Response(
        JSON.stringify({ error: "householdId é obrigatório", code: "MISSING_HOUSEHOLD" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!transactions || !Array.isArray(transactions) || transactions.length === 0) {
      return new Response(
        JSON.stringify({ error: "Nenhuma transação para importar", code: "EMPTY_TRANSACTIONS" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Limit number of transactions per import (prevent abuse)
    if (transactions.length > 2000) {
      return new Response(
        JSON.stringify({ error: "Máximo de 2000 transações por importação", code: "TOO_MANY_TRANSACTIONS" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`[import-csv][${traceId}] Importing ${transactions.length} transactions for household=${householdId}`);

    // Validate membership
    const { data: membership, error: memberError } = await supabase
      .from("household_members")
      .select("id, role")
      .eq("household_id", householdId)
      .eq("user_id", user.id)
      .single();

    if (memberError || !membership) {
      console.error("User not a member of household:", memberError);
      return new Response(
        JSON.stringify({ error: "Você não é membro desta família" }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Check PRO plan for CSV import (gracefully handle missing table/migration)
    try {
      const { data: planData, error: planError } = await supabase
        .from("household_plans")
        .select("plan")
        .eq("household_id", householdId)
        .single();

      if (planError) {
        // If table doesn't exist or no plan row, allow (dev mode / migration not applied)
        if (planError.code === "42P01" || planError.code === "PGRST116") {
          console.warn(`[import-csv][${traceId}] household_plans check failed (allowing): ${planError.message}`);
        } else {
          console.warn(`[import-csv][${traceId}] Plan check error: ${planError.message}`);
        }
      } else if (planData?.plan !== "PRO") {
        return new Response(
          JSON.stringify({ error: "Importação CSV é um recurso PRO", code: "PRO_REQUIRED" }),
          { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
    } catch (planCheckErr) {
      console.warn(`[import-csv][${traceId}] Plan check exception (allowing):`, planCheckErr);
    }

    // Check for duplicates if enabled
    let existingHashes = new Set<string>();
    if (skipDuplicates) {
      const hashes = transactions
        .map((t: TransactionToImport) => t.import_hash)
        .filter(Boolean);

      if (hashes.length > 0) {
        // Get existing transactions to check for duplicates by date+amount+description
        const { data: existing } = await supabase
          .from("transactions")
          .select("transaction_date, amount, description")
          .eq("household_id", householdId);

        if (existing) {
          for (const tx of existing) {
            const hash = generateHash(tx.transaction_date, tx.amount, tx.description);
            existingHashes.add(hash);
          }
        }
      }
    }

    const result: ImportResult = {
      imported: 0,
      duplicates: 0,
      failed: 0,
      errors: [],
    };

    // Process in batches
    const batchSize = 50;
    const toInsert: any[] = [];
    const now = new Date().toISOString();

    for (let i = 0; i < transactions.length; i++) {
      const tx = transactions[i] as TransactionToImport;

      // Validate required fields
      if (!tx.description || tx.description.trim() === "") {
        result.failed++;
        result.errors.push({ row: i + 1, reason: "Descrição obrigatória" });
        continue;
      }

      if (typeof tx.amount !== "number" || isNaN(tx.amount)) {
        result.failed++;
        result.errors.push({ row: i + 1, reason: "Valor inválido" });
        continue;
      }

      if (!tx.transaction_date || !/^\d{4}-\d{2}-\d{2}$/.test(tx.transaction_date)) {
        result.failed++;
        result.errors.push({ row: i + 1, reason: "Data inválida (formato esperado: YYYY-MM-DD)" });
        continue;
      }

      // Check for duplicates
      const hash = generateHash(tx.transaction_date, tx.amount, tx.description);
      if (skipDuplicates && existingHashes.has(hash)) {
        result.duplicates++;
        continue;
      }

      // Prepare transaction for insert
      toInsert.push({
        user_id: user.id,
        household_id: householdId,
        description: tx.description.substring(0, 255),
        amount: tx.amount,
        category: tx.category || "other",
        payment_method: tx.payment_method || "pix",
        status: tx.status || "paid",
        transaction_date: tx.transaction_date,
        notes: tx.notes ? tx.notes.substring(0, 500) : null,
        is_recurring: false,
        created_at: now,
        updated_at: now,
      });

      // Add to existing hashes to prevent duplicates within same import
      existingHashes.add(hash);
    }

    // Insert in batches
    for (let i = 0; i < toInsert.length; i += batchSize) {
      const batch = toInsert.slice(i, i + batchSize);
      
      const { error: insertError } = await supabase
        .from("transactions")
        .insert(batch);

      if (insertError) {
        console.error("Insert error:", insertError);
        result.failed += batch.length;
        result.errors.push({
          row: i + 1,
          reason: `Erro ao inserir lote: ${insertError.message}`,
        });
      } else {
        result.imported += batch.length;
      }
    }

    // Log audit (don't fail the import if audit fails)
    try {
      await supabase.from("admin_audit_logs").insert({
        admin_user_id: user.id,
        action_type: "CSV_IMPORT",
        target_type: "transactions",
        target_id: householdId,
        metadata: {
          total: transactions.length,
          imported: result.imported,
          duplicates: result.duplicates,
          failed: result.failed,
        },
      });
    } catch (auditError) {
      // Audit logging is best-effort; don't fail the import
      console.warn(`[import-csv][${traceId}] Audit log failed (non-blocking):`, auditError);
    }

    console.log(`[import-csv][${traceId}] Done: imported=${result.imported}, duplicates=${result.duplicates}, failed=${result.failed}`);

    return new Response(
      JSON.stringify(result),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("[import-csv] Unhandled error:", error);
    return new Response(
      JSON.stringify({ 
        error: error instanceof Error ? error.message : "Erro desconhecido",
        code: "INTERNAL_ERROR" 
      }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

function generateHash(date: string, amount: number, description: string): string {
  const normalized = `${date}|${Math.round(amount * 100)}|${description.toLowerCase().trim()}`;
  // Simple hash for deduplication
  let hash = 0;
  for (let i = 0; i < normalized.length; i++) {
    const char = normalized.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  return hash.toString(36);
}
