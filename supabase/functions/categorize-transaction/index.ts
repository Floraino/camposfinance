import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
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
    return new Response(null, { headers: corsHeaders });
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

    const GEMINI_API_KEY = Deno.env.get("GEMINI_API_KEY");
    if (!GEMINI_API_KEY) {
      console.warn(`[categorize][${traceId}] GEMINI_API_KEY not configured - using keyword fallback`);
    }

    const { description, descriptions, categorizeAll } = await req.json();

    // Handle batch categorization for Clara
    if (categorizeAll && descriptions?.length > 0) {
      console.log(`[categorize][${traceId}] Batch categorization: ${descriptions.length} items`);

      // If no API key, fall back to keyword matching for all descriptions
      if (!GEMINI_API_KEY) {
        const categories = descriptions.map((d: { id: string; description: string }) => {
          const descLower = d.description.toLowerCase();
          let matched = "other";
          for (const cat of CATEGORIES) {
            if (cat.keywords.some(kw => descLower.includes(kw))) {
              matched = cat.id;
              break;
            }
          }
          return { id: d.id, category: matched };
        });
        console.log(`[categorize][${traceId}] Batch done via keywords (no AI key)`);
        return new Response(JSON.stringify({ categories }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const prompt = `Você é um especialista em categorização de despesas financeiras brasileiras.

Categorize cada uma das seguintes descrições de transações em UMA das categorias abaixo:
- food: Alimentação (mercado, restaurante, delivery)
- transport: Transporte (uber, gasolina, estacionamento)
- bills: Contas Fixas (luz, água, internet, aluguel)
- health: Saúde (farmácia, médico, plano de saúde)
- education: Educação (escola, curso, livros)
- shopping: Compras (roupas, eletrônicos, presentes)
- leisure: Lazer (cinema, streaming, viagem)
- other: Outros (se não se encaixar em nenhuma)

Transações para categorizar:
${descriptions.map((d: { id: string; description: string }, i: number) => `${i + 1}. [ID: ${d.id}] ${d.description}`).join("\n")}

Responda APENAS com um JSON array no formato:
[{"id": "uuid", "category": "categoria"}]`;

      try {
        const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GEMINI_API_KEY}`;
        const response = await fetch(geminiUrl, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            contents: [{ role: "user", parts: [{ text: prompt }] }],
            generationConfig: { temperature: 0.1, maxOutputTokens: 4096 },
          }),
        });

        if (!response.ok) {
          console.error(`[categorize][${traceId}] AI batch error: ${response.status}`);
          // Fallback to keyword matching
          const categories = descriptions.map((d: { id: string; description: string }) => {
            const descLower = d.description.toLowerCase();
            let matched = "other";
            for (const cat of CATEGORIES) {
              if (cat.keywords.some(kw => descLower.includes(kw))) {
                matched = cat.id;
                break;
              }
            }
            return { id: d.id, category: matched };
          });
          return new Response(JSON.stringify({ categories }), {
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }

        const data = await response.json();
        const content = data.candidates?.[0]?.content?.parts
          ?.map((p: any) => p.text).filter(Boolean).join("") || "[]";
        
        // Extract JSON from response
        const jsonMatch = content.match(/\[[\s\S]*\]/);
        let categories;
        try {
          categories = jsonMatch ? JSON.parse(jsonMatch[0]) : [];
        } catch (parseErr) {
          console.error(`[categorize][${traceId}] Failed to parse Gemini batch response`);
          categories = [];
        }

        console.log(`[categorize][${traceId}] Batch done via Gemini: ${categories.length} results`);
        return new Response(JSON.stringify({ categories }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      } catch (batchErr) {
        console.error(`[categorize][${traceId}] Batch AI error, falling back to keywords:`, batchErr);
        const categories = descriptions.map((d: { id: string; description: string }) => {
          const descLower = d.description.toLowerCase();
          let matched = "other";
          for (const cat of CATEGORIES) {
            if (cat.keywords.some(kw => descLower.includes(kw))) {
              matched = cat.id;
              break;
            }
          }
          return { id: d.id, category: matched };
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
    if (!GEMINI_API_KEY) {
      console.log(`[categorize][${traceId}] No Gemini key, no keyword match: "${description}" → other`);
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
      const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GEMINI_API_KEY}`;
      const response = await fetch(geminiUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ role: "user", parts: [{ text: prompt }] }],
          generationConfig: { temperature: 0.1, maxOutputTokens: 64 },
        }),
      });

      if (!response.ok) {
        console.warn(`[categorize][${traceId}] Gemini error ${response.status} for "${description}"`);
        return new Response(JSON.stringify({ category: "other", confidence: 0.3 }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const data = await response.json();
      const aiCategory = (data.candidates?.[0]?.content?.parts
        ?.map((p: any) => p.text).filter(Boolean).join("") || "other").trim().toLowerCase();
      
      // Validate category
      const validCategories = ["food", "transport", "bills", "health", "education", "shopping", "leisure", "other"];
      const finalCategory = validCategories.includes(aiCategory) ? aiCategory : "other";

      console.log(`[categorize][${traceId}] AI: "${description}" → ${finalCategory}`);
      return new Response(JSON.stringify({ category: finalCategory, confidence: 0.8 }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    } catch (aiErr) {
      console.warn(`[categorize][${traceId}] AI call failed for "${description}":`, aiErr);
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
