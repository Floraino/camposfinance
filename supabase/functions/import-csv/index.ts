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
  status: string;
  transaction_date: string;
  notes?: string;
  import_hash?: string;
  account_id?: string | null;
  credit_card_id?: string | null;
  // Explicitly exclude payment_method - this field was removed from the schema
}

/**
 * Whitelist of valid columns in the transactions table schema.
 * Update this if the schema changes.
 */
const VALID_TRANSACTION_FIELDS = new Set([
  "user_id",
  "household_id",
  "description",
  "amount",
  "category",
  "status",
  "transaction_date",
  "notes",
  "is_recurring",
  "account_id",
  "credit_card_id",
  "member_id",
  "due_date",
  "installment_group_id",
  "installment_number",
  "attachments",
  "created_at",
  "updated_at",
  // Explicitly excluded: payment_method (removed from schema)
]);

/**
 * Sanitizes a transaction object to ensure only valid schema fields are included.
 * This prevents schema cache errors when inserting into transactions table.
 * Uses a whitelist approach to drop any unknown fields (e.g., payment_method).
 */
function sanitizeTransactionForInsert(tx: any): Record<string, any> {
  const sanitized: Record<string, any> = {};
  
  for (const [key, value] of Object.entries(tx)) {
    // Skip payment_method explicitly (even if it somehow got into the object)
    if (key === 'payment_method' || key === 'paymentMethod') {
      continue;
    }
    if (VALID_TRANSACTION_FIELDS.has(key)) {
      sanitized[key] = value;
    }
  }
  
  // Final safety check: explicitly delete payment_method if it somehow exists
  delete sanitized.payment_method;
  delete sanitized.paymentMethod;
  
  return sanitized;
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

    const body = await req.json();
    const {
      householdId,
      transactions,
      skipDuplicates = true,
      defaultAccountId: bodyDefaultAccountId = null,
      defaultCardId: bodyDefaultCardId = null,
      accountId = null,
      creditCardId = null,
      originalFilename = null,
      sourceType = "bank_account", // "bank_account" | "credit_card"
    } = body;

    // Apply sourceType rules:
    // - bank_account: defaultAccountId can be set, defaultCardId must be null
    // - credit_card: defaultCardId is required, defaultAccountId must be null
    const defaultAccountId = sourceType === "credit_card" 
      ? null 
      : (bodyDefaultAccountId ?? accountId ?? null);
    const defaultCardId = sourceType === "credit_card"
      ? (bodyDefaultCardId ?? creditCardId ?? null)
      : null;
    
    // Validate sourceType rules
    if (sourceType === "credit_card" && !defaultCardId) {
      return new Response(
        JSON.stringify({ error: "credit_card_id é obrigatório para importação de cartão de crédito", code: "MISSING_CARD" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
    
    if (sourceType === "bank_account" && defaultCardId) {
      // Warn but don't fail - just ignore cardId for bank_account mode
      console.warn(`[import-csv][${traceId}] defaultCardId provided but sourceType is bank_account, ignoring cardId`);
    }

    console.log(`[import-csv][${traceId}] CSV_IMPORT_STARTED User: ${user.id}, filename: ${originalFilename ?? "(none)"}, sourceType: ${sourceType}, defaultAccountId: ${defaultAccountId ?? "null"}, defaultCardId: ${defaultCardId ?? "null"}`);

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

    // Validate defaultAccountId belongs to household (only for bank_account mode)
    if (sourceType === "bank_account" && defaultAccountId) {
      const { data: accountRow, error: accountErr } = await supabase
        .from("accounts")
        .select("id")
        .eq("id", defaultAccountId)
        .eq("household_id", householdId)
        .single();
      if (accountErr || !accountRow) {
        return new Response(
          JSON.stringify({ error: "Conta selecionada não pertence a esta família", code: "INVALID_ACCOUNT" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
    }

    // Validate defaultCardId belongs to household (required for credit_card mode)
    if (sourceType === "credit_card") {
      if (!defaultCardId) {
        return new Response(
          JSON.stringify({ error: "Cartão de crédito é obrigatório para importação de extrato de cartão", code: "MISSING_CARD" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      const { data: cardRow, error: cardErr } = await supabase
        .from("credit_cards")
        .select("id")
        .eq("id", defaultCardId)
        .eq("household_id", householdId)
        .single();
      if (cardErr || !cardRow) {
        return new Response(
          JSON.stringify({ error: "Cartão selecionado não pertence a esta família", code: "INVALID_CARD" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
    } else if (defaultCardId) {
      // For bank_account mode, validate card if provided (but it's optional)
      const { data: cardRow, error: cardErr } = await supabase
        .from("credit_cards")
        .select("id")
        .eq("id", defaultCardId)
        .eq("household_id", householdId)
        .single();
      if (cardErr || !cardRow) {
        return new Response(
          JSON.stringify({ error: "Cartão selecionado não pertence a esta família", code: "INVALID_CARD" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
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
      const txRaw = transactions[i] as TransactionToImport;
      
      // Sanitize: extract only expected fields to prevent schema errors
      // Explicitly exclude payment_method/paymentMethod even if present in txRaw
      const tx: TransactionToImport = {
        description: txRaw.description,
        amount: txRaw.amount,
        category: txRaw.category,
        status: txRaw.status,
        transaction_date: txRaw.transaction_date,
        notes: txRaw.notes,
        import_hash: txRaw.import_hash,
        account_id: txRaw.account_id,
        credit_card_id: txRaw.credit_card_id,
        // Explicitly NOT including: payment_method, paymentMethod (removed from schema)
      };

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

      // Cartão: aceitar positivos e negativos; normalizar sempre para gasto (amount < 0). Não rejeitar negativos.
      if (sourceType === "credit_card") {
        tx.amount = -Math.abs(tx.amount);
      }

      // Validate and normalize transaction_date
      let normalizedDate = tx.transaction_date;
      if (!normalizedDate) {
        result.failed++;
        result.errors.push({ row: i + 1, reason: "Data não encontrada" });
        continue;
      }
      
      // If not in ISO format, try to parse (fallback for edge cases)
      if (!/^\d{4}-\d{2}-\d{2}$/.test(normalizedDate)) {
        // Try to parse DD/MM/YYYY or other formats
        const parsed = parseDateToISO(normalizedDate);
        if (parsed) {
          normalizedDate = parsed;
        } else {
          result.failed++;
          result.errors.push({ row: i + 1, reason: `Data inválida: "${tx.transaction_date}" (formato esperado: YYYY-MM-DD)` });
          continue;
        }
      }
      
      // Use normalized date
      tx.transaction_date = normalizedDate;

      // Check for duplicates
      const hash = generateHash(tx.transaction_date, tx.amount, tx.description);
      if (skipDuplicates && existingHashes.has(hash)) {
        result.duplicates++;
        continue;
      }

      // Apply sourceType rules: only one link type per transaction
      const rowAccountId = sourceType === "credit_card" 
        ? null 
        : (tx.account_id ?? defaultAccountId ?? null);
      const rowCardId = sourceType === "credit_card"
        ? (tx.credit_card_id ?? defaultCardId ?? null)
        : null;

      // Construct insert object with only valid schema fields
      const insertObj = {
        user_id: user.id,
        household_id: householdId,
        description: tx.description.substring(0, 255),
        amount: tx.amount,
        category: tx.category || "other",
        status: tx.status || "paid",
        transaction_date: tx.transaction_date,
        notes: tx.notes ? tx.notes.substring(0, 500) : null,
        is_recurring: false,
        account_id: rowAccountId,
        credit_card_id: rowCardId,
        created_at: now,
        updated_at: now,
      };
      
      // Sanitize to ensure no extra fields (e.g., payment_method) are included
      const sanitized = sanitizeTransactionForInsert(insertObj);
      
      toInsert.push(sanitized);

      // Add to existing hashes to prevent duplicates within same import
      existingHashes.add(hash);
    }

    // Insert in batches
    for (let i = 0; i < toInsert.length; i += batchSize) {
      const batch = toInsert.slice(i, i + batchSize);
      
      // Final safety check: rebuild each transaction using only whitelist fields
      // This ensures no extra fields (like payment_method) can slip through
      const finalBatch = batch.map(tx => {
        const clean: Record<string, any> = {};
        // Only copy fields that are in the whitelist
        for (const key of VALID_TRANSACTION_FIELDS) {
          if (key in tx && tx[key] !== undefined) {
            clean[key] = tx[key];
          }
        }
        // Explicitly ensure payment_method is NOT present
        if ('payment_method' in clean) delete clean.payment_method;
        if ('paymentMethod' in clean) delete clean.paymentMethod;
        return clean;
      });
      
      // Validate: ensure no payment_method in final batch before insert
      const hasPaymentMethod = finalBatch.some(tx => 
        'payment_method' in tx || 'paymentMethod' in tx || 
        Object.keys(tx).includes('payment_method') || Object.keys(tx).includes('paymentMethod')
      );
      if (hasPaymentMethod) {
        console.error(`[import-csv][${traceId}] ERROR: payment_method found in final batch before insert!`);
        throw new Error("Invalid transaction data: payment_method field detected");
      }
      
      const { error: insertError } = await supabase
        .from("transactions")
        .insert(finalBatch);

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
          originalFilename: originalFilename ?? undefined,
          sourceType: sourceType,
          accountId: defaultAccountId ?? undefined,
          creditCardId: defaultCardId ?? undefined,
        },
      });
    } catch (auditError) {
      // Audit logging is best-effort; don't fail the import
      console.warn(`[import-csv][${traceId}] Audit log failed (non-blocking):`, auditError);
    }

    console.log(`[import-csv][${traceId}] CSV_IMPORT_COMPLETED imported=${result.imported}, duplicates=${result.duplicates}, failed=${result.failed}`);

    const responsePayload = {
      ...result,
      createdCount: result.imported,
      sourceType: sourceType,
      linkedAccountId: defaultAccountId ?? null,
      linkedCardId: defaultCardId ?? null,
    };

    return new Response(
      JSON.stringify(responsePayload),
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

/**
 * Parse date from various formats to ISO format (YYYY-MM-DD)
 * Fallback function for edge cases where frontend didn't normalize
 */
function parseDateToISO(value: string | number | null): string | null {
  if (!value) return null;
  
  // Already in ISO format
  if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return value;
  }
  
  // Handle Excel serial dates (number)
  if (typeof value === "number") {
    if (value > 1 && value < 100000) {
      const excelEpoch = new Date(1899, 11, 30);
      const date = new Date(excelEpoch.getTime() + value * 86400000);
      if (!isNaN(date.getTime())) {
        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, "0");
        const day = String(date.getDate()).padStart(2, "0");
        return `${year}-${month}-${day}`;
      }
    }
    return null;
  }
  
  // Handle string formats
  if (typeof value !== "string") return null;
  
  const trimmed = value.trim().replace(/\s+/g, "");
  if (!trimmed) return null;
  
  // Extract date part if has time component
  let datePart = trimmed;
  const dateTimeMatch = trimmed.match(/^(\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4}|\d{4}[\/\-]\d{1,2}[\/\-]\d{1,2})/);
  if (dateTimeMatch) {
    datePart = dateTimeMatch[1];
  }
  
  // Try DD/MM/YYYY
  const ddmmMatch = datePart.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/);
  if (ddmmMatch) {
    const day = parseInt(ddmmMatch[1], 10);
    const month = parseInt(ddmmMatch[2], 10);
    const year = parseInt(ddmmMatch[3], 10);
    if (day >= 1 && day <= 31 && month >= 1 && month <= 12 && year >= 1900 && year <= 2100) {
      const date = new Date(year, month - 1, day);
      if (!isNaN(date.getTime()) && date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day) {
        return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
      }
    }
  }
  
  // Try YYYY-MM-DD
  const yyyymmddMatch = datePart.match(/^(\d{4})[\/\-](\d{1,2})[\/\-](\d{1,2})$/);
  if (yyyymmddMatch) {
    const year = parseInt(yyyymmddMatch[1], 10);
    const month = parseInt(yyyymmddMatch[2], 10);
    const day = parseInt(yyyymmddMatch[3], 10);
    if (day >= 1 && day <= 31 && month >= 1 && month <= 12 && year >= 1900 && year <= 2100) {
      return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    }
  }
  
  return null;
}

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
