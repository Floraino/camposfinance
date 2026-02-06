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
    const traceId = crypto.randomUUID().slice(0, 8);
    console.log(`[scan-receipt][${traceId}] Request received`);

    const GEMINI_API_KEY = Deno.env.get("GEMINI_API_KEY");
    if (!GEMINI_API_KEY) {
      console.error(`[scan-receipt][${traceId}] GEMINI_API_KEY not configured`);
      return new Response(JSON.stringify({ 
        error: "Serviço de IA não configurado",
        code: "AI_NOT_CONFIGURED",
        details: "GEMINI_API_KEY não está definida nos secrets do Supabase. Configure em: Dashboard → Edge Functions → Secrets." 
      }), {
        status: 503,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    
    if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
      console.error(`[scan-receipt][${traceId}] Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY`);
      return new Response(JSON.stringify({ 
        error: "Configuração do servidor incompleta",
        code: "SERVER_MISCONFIGURED",
        details: "SUPABASE_URL ou SUPABASE_SERVICE_ROLE_KEY não configurados." 
      }), {
        status: 503,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Verify user authentication
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Missing authorization header", code: "UNAUTHORIZED" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    const token = authHeader.replace("Bearer ", "");
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    
    if (authError || !user) {
      console.warn(`[scan-receipt][${traceId}] Auth failed:`, authError?.message);
      return new Response(JSON.stringify({ error: "Token inválido ou expirado", code: "UNAUTHORIZED" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    console.log(`[scan-receipt][${traceId}] User: ${user.id}`);

    const { imageBase64, mimeType, householdId } = await req.json();

    // Validate household membership and PRO plan
    if (!householdId) {
      return new Response(JSON.stringify({ error: "Household ID é obrigatório", code: "MISSING_HOUSEHOLD" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Check if user is member of the household
    const { data: memberData, error: memberError } = await supabase
      .from("household_members")
      .select("id")
      .eq("household_id", householdId)
      .eq("user_id", user.id)
      .single();

    if (memberError || !memberData) {
      console.warn(`[scan-receipt][${traceId}] Not a member: household=${householdId}`);
      return new Response(JSON.stringify({ error: "Você não é membro desta família", code: "NOT_MEMBER" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Check if household has PRO plan using the can_use_ocr function
    // Gracefully handle case where function doesn't exist (migration not applied)
    let ocrAllowed = true;
    try {
      const { data: canUseOcr, error: planError } = await supabase
        .rpc("can_use_ocr", { _household_id: householdId });

      if (planError) {
        // If RPC doesn't exist, allow OCR (migration not applied yet = free tier / dev)
        if (planError.message?.includes("function") || planError.code === "42883") {
          console.warn(`[scan-receipt][${traceId}] can_use_ocr RPC not found, allowing by default`);
          ocrAllowed = true;
        } else {
          console.error(`[scan-receipt][${traceId}] Error checking OCR permission:`, planError);
          return new Response(JSON.stringify({ error: "Erro ao verificar permissão", code: "PLAN_CHECK_ERROR" }), {
            status: 500,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
      } else {
        ocrAllowed = !!canUseOcr;
      }
    } catch (rpcError) {
      console.warn(`[scan-receipt][${traceId}] RPC check failed, allowing:`, rpcError);
      ocrAllowed = true;
    }

    if (!ocrAllowed) {
      return new Response(JSON.stringify({ 
        error: "Recurso PRO",
        message: "OCR está disponível apenas no plano PRO da família",
        code: "PRO_REQUIRED"
      }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!imageBase64) {
      return new Response(JSON.stringify({ error: "Nenhuma imagem enviada", code: "NO_IMAGE" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Validate image size (max 4MB base64)
    if (imageBase64.length > 4 * 1024 * 1024) {
      return new Response(JSON.stringify({ 
        error: "Imagem muito grande", 
        code: "IMAGE_TOO_LARGE",
        details: `Tamanho: ${(imageBase64.length / 1024 / 1024).toFixed(1)}MB. Máximo: 3MB.`
      }), {
        status: 413,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    console.log(`[scan-receipt][${traceId}] Processing: size=${(imageBase64.length / 1024).toFixed(0)}KB, type=${mimeType}, household=${householdId}`);

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

    console.log(`[scan-receipt][${traceId}] Calling Gemini Vision API...`);
    const aiStartTime = Date.now();

    // Call Gemini Vision API directly
    const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GEMINI_API_KEY}`;
    
    const geminiBody = {
      contents: [{
        role: "user",
        parts: [
          {
            inlineData: {
              mimeType: mimeType || "image/jpeg",
              data: imageBase64,
            },
          },
          {
            text: "Extraia os dados deste cupom/nota fiscal e retorne APENAS o JSON com os dados.",
          },
        ],
      }],
      systemInstruction: { parts: [{ text: systemPrompt }] },
      generationConfig: {
        temperature: 0.1,
        maxOutputTokens: 4096,
      },
    };

    const response = await fetch(geminiUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(geminiBody),
    });

    const aiDuration = Date.now() - aiStartTime;
    console.log(`[scan-receipt][${traceId}] Gemini response: status=${response.status}, duration=${aiDuration}ms`);

    if (!response.ok) {
      if (response.status === 429) {
        return new Response(JSON.stringify({ error: "Muitas requisições. Por favor, aguarde um momento.", code: "RATE_LIMITED" }), {
          status: 429,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (response.status === 403) {
        return new Response(JSON.stringify({ error: "GEMINI_API_KEY inválida ou sem permissão.", code: "INVALID_API_KEY" }), {
          status: 403,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const errorText = await response.text();
      console.error(`[scan-receipt][${traceId}] Gemini error: ${response.status} ${errorText.substring(0, 300)}`);
      return new Response(JSON.stringify({ 
        error: "Erro ao processar imagem", 
        code: "AI_ERROR",
        details: `Gemini retornou status ${response.status}` 
      }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const geminiData = await response.json();
    const content = geminiData.candidates?.[0]?.content?.parts
      ?.map((p: any) => p.text)
      .filter(Boolean)
      .join("") || "";

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

    console.log(`[scan-receipt][${traceId}] Success: description="${sanitizedData.description}", amount=${sanitizedData.amount}, confidence=${sanitizedData.confidence}`);

    return new Response(JSON.stringify(sanitizedData), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("[scan-receipt] Unhandled error:", e);
    return new Response(JSON.stringify({ 
      error: e instanceof Error ? e.message : "Erro desconhecido",
      code: "INTERNAL_ERROR" 
    }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
