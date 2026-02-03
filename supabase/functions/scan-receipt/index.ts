import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

interface ExtractedReceipt {
  description: string;
  amount: number;
  date: string;
  category: string;
  paymentMethod: string;
  items: Array<{ name: string; quantity: number; price: number }>;
  establishment: string;
  confidence: number;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      throw new Error("LOVABLE_API_KEY is not configured");
    }

    const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    
    if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
      throw new Error("Supabase configuration is missing");
    }

    // Verify user authentication
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Missing authorization header" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    const token = authHeader.replace("Bearer ", "");
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    
    if (authError || !user) {
      return new Response(JSON.stringify({ error: "Invalid token" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { imageBase64, mimeType } = await req.json();

    if (!imageBase64) {
      return new Response(JSON.stringify({ error: "No image provided" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const systemPrompt = `Você é um especialista em leitura de cupons fiscais, notas fiscais e comprovantes de pagamento brasileiros.

Analise a imagem e extraia as seguintes informações:

1. **description**: Nome do estabelecimento ou descrição principal da compra
2. **amount**: Valor total em reais (número, sem R$)
3. **date**: Data da compra no formato YYYY-MM-DD
4. **category**: Categoria mais apropriada entre: food, transport, leisure, health, education, shopping, bills, other
5. **paymentMethod**: Método de pagamento entre: pix, boleto, card, cash
6. **items**: Lista de itens comprados (se visível), cada um com name, quantity e price
7. **establishment**: Nome completo do estabelecimento
8. **confidence**: Confiança na extração de 0 a 1 (1 = muito confiante)

REGRAS IMPORTANTES:
- Se não conseguir identificar algum campo, use valores padrão sensatos
- Para category, use "food" para supermercados/restaurantes, "shopping" para lojas, "bills" para contas, etc.
- Se a data não for visível, use a data de hoje: ${new Date().toISOString().split('T')[0]}
- Se o método de pagamento não for claro, use "card"
- O amount deve ser sempre positivo
- Retorne APENAS o JSON, sem explicações adicionais

Exemplo de resposta:
{
  "description": "Supermercado Extra",
  "amount": 156.78,
  "date": "2025-02-03",
  "category": "food",
  "paymentMethod": "card",
  "items": [
    {"name": "Arroz 5kg", "quantity": 1, "price": 25.90},
    {"name": "Feijão 1kg", "quantity": 2, "price": 8.50}
  ],
  "establishment": "Extra Hipermercado - Loja Centro",
  "confidence": 0.95
}`;

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          { role: "system", content: systemPrompt },
          { 
            role: "user", 
            content: [
              {
                type: "image_url",
                image_url: {
                  url: `data:${mimeType || 'image/jpeg'};base64,${imageBase64}`
                }
              },
              {
                type: "text",
                text: "Extraia os dados deste cupom/nota fiscal e retorne APENAS o JSON com os dados."
              }
            ]
          },
        ],
      }),
    });

    if (!response.ok) {
      if (response.status === 429) {
        return new Response(JSON.stringify({ error: "Muitas requisições. Por favor, aguarde um momento." }), {
          status: 429,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (response.status === 402) {
        return new Response(JSON.stringify({ error: "Limite de uso atingido." }), {
          status: 402,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const errorText = await response.text();
      console.error("AI gateway error:", response.status, errorText);
      return new Response(JSON.stringify({ error: "Erro ao processar imagem" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const aiResponse = await response.json();
    const content = aiResponse.choices?.[0]?.message?.content;

    if (!content) {
      return new Response(JSON.stringify({ error: "Não foi possível extrair dados da imagem" }), {
        status: 422,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Parse the JSON response from AI
    let extractedData: ExtractedReceipt;
    try {
      // Remove markdown code blocks if present
      const jsonStr = content.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
      extractedData = JSON.parse(jsonStr);
    } catch (parseError) {
      console.error("Failed to parse AI response:", content);
      return new Response(JSON.stringify({ 
        error: "Não foi possível interpretar os dados do cupom",
        rawContent: content 
      }), {
        status: 422,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Validate and sanitize the extracted data
    const sanitizedData: ExtractedReceipt = {
      description: extractedData.description || "Compra",
      amount: Math.abs(Number(extractedData.amount) || 0),
      date: extractedData.date || new Date().toISOString().split('T')[0],
      category: ["food", "transport", "leisure", "health", "education", "shopping", "bills", "other"].includes(extractedData.category) 
        ? extractedData.category 
        : "other",
      paymentMethod: ["pix", "boleto", "card", "cash"].includes(extractedData.paymentMethod) 
        ? extractedData.paymentMethod 
        : "card",
      items: Array.isArray(extractedData.items) ? extractedData.items : [],
      establishment: extractedData.establishment || extractedData.description || "Estabelecimento",
      confidence: Math.min(1, Math.max(0, Number(extractedData.confidence) || 0.5)),
    };

    return new Response(JSON.stringify(sanitizedData), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("scan-receipt error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Erro desconhecido" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
