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
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      throw new Error("LOVABLE_API_KEY is not configured");
    }

    const { description, descriptions, categorizeAll } = await req.json();

    // Handle batch categorization for Clara
    if (categorizeAll && descriptions?.length > 0) {
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

      const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${LOVABLE_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "google/gemini-3-flash-preview",
          messages: [{ role: "user", content: prompt }],
        }),
      });

      if (!response.ok) {
        throw new Error("AI gateway error");
      }

      const data = await response.json();
      const content = data.choices?.[0]?.message?.content || "[]";
      
      // Extract JSON from response
      const jsonMatch = content.match(/\[[\s\S]*\]/);
      const categories = jsonMatch ? JSON.parse(jsonMatch[0]) : [];

      return new Response(JSON.stringify({ categories }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Single description categorization
    if (!description) {
      return new Response(JSON.stringify({ category: "other" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const descLower = description.toLowerCase();

    // First try keyword matching for speed
    for (const cat of CATEGORIES) {
      if (cat.keywords.some(kw => descLower.includes(kw))) {
        return new Response(JSON.stringify({ category: cat.id, confidence: 0.9 }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
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

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash-lite",
        messages: [{ role: "user", content: prompt }],
      }),
    });

    if (!response.ok) {
      // Fallback to 'other' if AI fails
      return new Response(JSON.stringify({ category: "other", confidence: 0.5 }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const data = await response.json();
    const aiCategory = data.choices?.[0]?.message?.content?.trim().toLowerCase() || "other";
    
    // Validate category
    const validCategories = ["food", "transport", "bills", "health", "education", "shopping", "leisure", "other"];
    const finalCategory = validCategories.includes(aiCategory) ? aiCategory : "other";

    return new Response(JSON.stringify({ category: finalCategory, confidence: 0.8 }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("categorize-transaction error:", e);
    return new Response(JSON.stringify({ category: "other", confidence: 0.5 }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
