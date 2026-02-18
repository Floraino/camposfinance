import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
  "Access-Control-Max-Age": "86400",
};

const CATEGORIES = [
  { id: "food", label: "Alimentação", keywords: ["mercado", "supermercado", "restaurante", "lanche", "almoço", "jantar", "café", "padaria", "açougue", "feira", "ifood", "rappi", "uber eats", "delivery"] },
  { id: "transport", label: "Transporte", keywords: ["uber", "99", "gasolina", "combustível", "estacionamento", "pedágio", "ônibus", "metrô", "passagem", "táxi", "carro", "moto", "ipva", "seguro auto"] },
  { id: "bills", label: "Contas Fixas", keywords: ["luz", "água", "gás", "internet", "telefone", "celular", "aluguel", "condomínio", "iptu", "energia", "enel", "sabesp", "comgás", "vivo", "claro", "tim", "oi"] },
  { id: "health", label: "Saúde", keywords: ["farmácia", "remédio", "médico", "consulta", "exame", "hospital", "dentista", "plano de saúde", "drogaria", "drogasil", "droga raia", "pacheco", "academia", "psicólogo"] },
  { id: "education", label: "Educação", keywords: ["escola", "faculdade", "curso", "livro", "material escolar", "mensalidade", "apostila", "udemy", "alura", "inglês", "idioma"] },
  { id: "shopping", label: "Compras", keywords: ["roupa", "sapato", "loja", "shopping", "amazon", "mercado livre", "shein", "aliexpress", "magazine", "americanas", "casas bahia", "presente"] },
  { id: "leisure", label: "Lazer", keywords: ["cinema", "netflix", "spotify", "disney", "hbo", "prime", "show", "teatro", "viagem", "hotel", "airbnb", "bar", "festa", "jogo", "game", "steam", "playstation", "xbox"] },
  { id: "other", label: "Outros", keywords: [] },
];

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const traceId = crypto.randomUUID().slice(0, 8);

    // Auth check — require valid session token
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: "Não autorizado", code: "UNAUTHORIZED" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const supabaseAuth = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user }, error: authError } = await supabaseAuth.auth.getUser();
    if (authError || !user) {
      return new Response(
        JSON.stringify({ error: "Usuário não autenticado", code: "UNAUTHORIZED" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const MANUS_API_KEY = Deno.env.get("MANUS_API_KEY");
    if (!MANUS_API_KEY) {
      console.warn(`[categorize][${traceId}] MANUS_API_KEY not configured - using keyword fallback`);
    }

    const body = await req.json();
    const { description, descriptions, categorizeAll, allowedCategories: bodyAllowed, categoryLabels: bodyLabels } = body;

    const allowedSet = bodyAllowed && Array.isArray(bodyAllowed) ? new Set(bodyAllowed as string[]) : null;
    const categoryLabels = bodyLabels && typeof bodyLabels === "object" ? bodyLabels as Record<string, string> : null;

    // Handle batch categorization for Clara
    if (categorizeAll && descriptions?.length > 0) {
      console.log(`[categorize][${traceId}] Batch categorization: ${descriptions.length} items`);

      // If no API key, fall back to keyword matching for all descriptions
      if (!MANUS_API_KEY) {
        const categories = descriptions.map((d: { id: string; description: string }) => {
          const descLower = d.description.toLowerCase();
          let matched = "other";
          for (const cat of CATEGORIES) {
            if (cat.keywords.some(kw => descLower.includes(kw))) {
              matched = cat.id;
              break;
            }
          }
          if (allowedSet && !allowedSet.has(matched)) matched = allowedSet.has("other") ? "other" : Array.from(allowedSet)[0] ?? "other";
          return { id: d.id, category: matched, confidence: 0.8 };
        });
        console.log(`[categorize][${traceId}] Batch done via keywords (no AI key)`);
        return new Response(JSON.stringify({ categories }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const defaultLines = [
        "food: Alimentação (mercado, restaurante, delivery)",
        "transport: Transporte (uber, gasolina, estacionamento)",
        "bills: Contas Fixas (luz, água, internet, aluguel)",
        "health: Saúde (farmácia, médico, plano de saúde)",
        "education: Educação (escola, curso, livros)",
        "shopping: Compras (roupas, eletrônicos, presentes)",
        "leisure: Lazer (cinema, streaming, viagem)",
        "other: Outros (se não se encaixar em nenhuma)",
      ];
      const categoryLines = categoryLabels && allowedSet
        ? Array.from(allowedSet).map((id) => `${id}: ${categoryLabels[id] ?? id}`)
        : defaultLines;

      const prompt = `Você é um especialista em categorização de despesas financeiras brasileiras.

Categorize cada uma das seguintes descrições de transações em UMA das categorias abaixo (use o ID exato da categoria):
${categoryLines.map((l) => `- ${l}`).join("\n")}

Transações para categorizar:
${descriptions.map((d: { id: string; description: string }, i: number) => `${i + 1}. [ID: ${d.id}] ${d.description}`).join("\n")}

Responda APENAS com um JSON array no formato (confidence entre 0 e 1, use 0.9+ quando tiver certeza). No campo "category" use exatamente um dos IDs listados acima:
[{"id": "uuid", "category": "id_da_categoria", "confidence": 0.95}]`;

      try {
        // Use Manus AI provider
        const { generateText } = await import("../_shared/manusProvider.ts");
        const result = await generateText({
          prompt,
          systemInstruction: undefined,
          temperature: 0.1,
          maxTokens: 4096,
        });
        
        // Extract content from Manus response
        const content = result.text || "[]";

        // Content already extracted from Manus response
        
        // Extract JSON from response
        const jsonMatch = content.match(/\[[\s\S]*\]/);
        let rawCategories: Array<{ id: string; category: string; confidence?: number }>;
        try {
          rawCategories = jsonMatch ? JSON.parse(jsonMatch[0]) : [];
        } catch (parseErr) {
          console.error(`[categorize][${traceId}] Failed to parse Manus batch response`);
          rawCategories = [];
        }
        const fallbackCat = allowedSet ? (allowedSet.has("other") ? "other" : Array.from(allowedSet)[0] ?? "other") : "other";
        const categories = rawCategories.map((c: { id: string; category: string; confidence?: number }) => {
          let cat = (c.category || "other").trim();
          if (allowedSet && !allowedSet.has(cat)) cat = fallbackCat;
          return {
            id: c.id,
            category: cat,
            confidence: typeof c.confidence === "number" ? c.confidence : 0.85,
          };
        });

        console.log(`[categorize][${traceId}] Batch done via Manus: ${categories.length} results`);
        return new Response(JSON.stringify({ categories }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      } catch (batchErr) {
        console.error(`[categorize][${traceId}] Batch Manus error, falling back to keywords:`, batchErr);
        const fallbackCat = allowedSet ? (allowedSet.has("other") ? "other" : Array.from(allowedSet)[0] ?? "other") : "other";
        const categories = descriptions.map((d: { id: string; description: string }) => {
          const descLower = d.description.toLowerCase();
          let matched = "other";
          for (const cat of CATEGORIES) {
            if (cat.keywords.some(kw => descLower.includes(kw))) {
              matched = cat.id;
              break;
            }
          }
          if (allowedSet && !allowedSet.has(matched)) matched = fallbackCat;
          return { id: d.id, category: matched, confidence: 0.8 };
        });
        return new Response(JSON.stringify({ categories }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    // Single description categorization
    if (!description) {
      return new Response(JSON.stringify({ category: "other", confidence: 0 }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const descLower = description.toLowerCase();

    // First try keyword matching for speed
    for (const cat of CATEGORIES) {
      if (cat.keywords.some(kw => descLower.includes(kw))) {
        console.log(`[categorize][${traceId}] Keyword match: "${description}" → ${cat.id}`);
        return new Response(JSON.stringify({ category: cat.id, confidence: 0.9 }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    // If no API key or no keyword match, return 'other'
    if (!MANUS_API_KEY) {
      console.log(`[categorize][${traceId}] No Manus key, no keyword match: "${description}" → other`);
      return new Response(JSON.stringify({ category: "other", confidence: 0.3 }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // If no keyword match, use AI
    const prompt = `Categorize a seguinte despesa brasileira em UMA categoria:
- food (Alimentação)
- transport (Transporte)
- bills (Contas Fixas)
- health (Saúde)
- education (Educação)
- shopping (Compras)
- leisure (Lazer)
- other (Outros)

Despesa: "${description}"

Responda APENAS com o ID da categoria (ex: food, transport, etc).`;

    try {
      // Use Manus AI provider
      const { generateText } = await import("../_shared/manusProvider.ts");
      const result = await generateText({
        prompt,
        systemInstruction: undefined,
        temperature: 0.1,
        maxTokens: 64,
      });
      
      const aiCategory = (result.text || "other").trim().toLowerCase();
      
      // Validate category
      const validCategories = ["food", "transport", "bills", "health", "education", "shopping", "leisure", "other"];
      const finalCategory = validCategories.includes(aiCategory) ? aiCategory : "other";

      console.log(`[categorize][${traceId}] Manus: "${description}" → ${finalCategory}`);
      return new Response(JSON.stringify({ category: finalCategory, confidence: 0.8 }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    } catch (aiErr) {
      console.warn(`[categorize][${traceId}] Manus call failed for "${description}":`, aiErr);
      return new Response(JSON.stringify({ category: "other", confidence: 0.3 }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
  } catch (e) {
    console.error("[categorize] Unhandled error:", e);
    return new Response(JSON.stringify({ category: "other", confidence: 0 }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
