/**
 * Gemini AI Provider - Unified AI layer for all Edge Functions.
 *
 * Replaces the old Lovable AI Gateway.
 * Uses Google Gemini API directly via REST.
 *
 * Models:
 *   - gemini-2.5-flash   → OCR / vision (scan-receipt)
 *   - gemini-2.5-flash   → CSV analysis, chat, batch categorization
 *   - gemini-2.5-flash   → single categorization (lightweight)
 *
 * Env: GEMINI_API_KEY (required in Supabase Edge Function Secrets)
 */

// ── Constants ────────────────────────────────────────────────────────────────
const GEMINI_BASE_URL = "https://generativelanguage.googleapis.com/v1beta";
const DEFAULT_MODEL = "gemini-2.5-flash";
const MAX_RETRIES = 2;
const RETRY_DELAY_MS = 1000;

// ── Types ────────────────────────────────────────────────────────────────────
export interface GeminiTextRequest {
  model?: string;
  systemInstruction?: string;
  prompt: string;
  temperature?: number;
  maxTokens?: number;
}

export interface GeminiVisionRequest {
  model?: string;
  systemInstruction?: string;
  prompt: string;
  imageBase64: string;
  mimeType: string;
  temperature?: number;
  maxTokens?: number;
}

export interface GeminiStreamRequest {
  model?: string;
  systemInstruction?: string;
  messages: Array<{ role: string; content: string }>;
  tools?: any[];
  temperature?: number;
}

export interface GeminiResponse {
  text: string;
  finishReason?: string;
  usage?: { promptTokens: number; completionTokens: number; totalTokens: number };
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function getApiKey(): string {
  const key = Deno.env.get("GEMINI_API_KEY");
  if (!key) {
    throw new GeminiConfigError(
      "GEMINI_API_KEY não está configurada. " +
      "Configure em: Supabase Dashboard → Edge Functions → Secrets."
    );
  }
  return key;
}

export class GeminiConfigError extends Error {
  code = "AI_NOT_CONFIGURED";
  constructor(message: string) {
    super(message);
    this.name = "GeminiConfigError";
  }
}

export class GeminiApiError extends Error {
  code: string;
  status: number;
  constructor(message: string, status: number, code: string) {
    super(message);
    this.name = "GeminiApiError";
    this.status = status;
    this.code = code;
  }
}

async function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

// ── Text Generation ──────────────────────────────────────────────────────────

export async function generateText(req: GeminiTextRequest): Promise<GeminiResponse> {
  const apiKey = getApiKey();
  const model = req.model || DEFAULT_MODEL;
  const url = `${GEMINI_BASE_URL}/models/${model}:generateContent?key=${apiKey}`;

  const body: any = {
    contents: [{ role: "user", parts: [{ text: req.prompt }] }],
    generationConfig: {
      temperature: req.temperature ?? 0.2,
      maxOutputTokens: req.maxTokens ?? 4096,
    },
  };

  if (req.systemInstruction) {
    body.systemInstruction = { parts: [{ text: req.systemInstruction }] };
  }

  return callGeminiWithRetry(url, body);
}

// ── Vision (OCR) ─────────────────────────────────────────────────────────────

export async function generateFromImage(req: GeminiVisionRequest): Promise<GeminiResponse> {
  const apiKey = getApiKey();
  const model = req.model || DEFAULT_MODEL;
  const url = `${GEMINI_BASE_URL}/models/${model}:generateContent?key=${apiKey}`;

  const body: any = {
    contents: [
      {
        role: "user",
        parts: [
          {
            inlineData: {
              mimeType: req.mimeType || "image/jpeg",
              data: req.imageBase64,
            },
          },
          { text: req.prompt },
        ],
      },
    ],
    generationConfig: {
      temperature: req.temperature ?? 0.1,
      maxOutputTokens: req.maxTokens ?? 4096,
    },
  };

  if (req.systemInstruction) {
    body.systemInstruction = { parts: [{ text: req.systemInstruction }] };
  }

  return callGeminiWithRetry(url, body);
}

// ── Streaming (for Clara chat) ───────────────────────────────────────────────

export async function generateStream(
  req: GeminiStreamRequest
): Promise<Response> {
  const apiKey = getApiKey();
  const model = req.model || DEFAULT_MODEL;
  const url = `${GEMINI_BASE_URL}/models/${model}:streamGenerateContent?alt=sse&key=${apiKey}`;

  // Convert OpenAI-style messages to Gemini format
  const contents: any[] = [];
  let systemInstruction: string | undefined;

  for (const msg of req.messages) {
    if (msg.role === "system") {
      systemInstruction = msg.content;
    } else {
      contents.push({
        role: msg.role === "assistant" ? "model" : "user",
        parts: [{ text: msg.content }],
      });
    }
  }

  if (req.systemInstruction) {
    systemInstruction = req.systemInstruction;
  }

  const body: any = {
    contents,
    generationConfig: {
      temperature: req.temperature ?? 0.7,
      maxOutputTokens: 8192,
    },
  };

  if (systemInstruction) {
    body.systemInstruction = { parts: [{ text: systemInstruction }] };
  }

  // Note: Gemini tool calling uses a different format; for now, tools are
  // omitted and handled by the clara-chat function directly.

  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new GeminiApiError(
      `Gemini stream error: ${errText.substring(0, 300)}`,
      response.status,
      response.status === 429 ? "RATE_LIMITED" : "AI_ERROR"
    );
  }

  return response;
}

// ── Core fetch with retry ────────────────────────────────────────────────────

async function callGeminiWithRetry(url: string, body: any): Promise<GeminiResponse> {
  let lastError: Error | null = null;

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      const response = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      if (response.status === 429) {
        console.warn(`[gemini] Rate limited (attempt ${attempt + 1}/${MAX_RETRIES + 1})`);
        if (attempt < MAX_RETRIES) {
          await sleep(RETRY_DELAY_MS * (attempt + 1));
          continue;
        }
        throw new GeminiApiError("Muitas requisições. Aguarde um momento.", 429, "RATE_LIMITED");
      }

      if (response.status === 403) {
        throw new GeminiApiError(
          "GEMINI_API_KEY inválida ou sem permissão. Verifique a chave no Google AI Studio.",
          403,
          "INVALID_API_KEY"
        );
      }

      if (!response.ok) {
        const errText = await response.text();
        throw new GeminiApiError(
          `Gemini API retornou status ${response.status}: ${errText.substring(0, 300)}`,
          response.status,
          "AI_ERROR"
        );
      }

      const data = await response.json();
      const candidate = data.candidates?.[0];
      const text = candidate?.content?.parts
        ?.map((p: any) => p.text)
        .filter(Boolean)
        .join("") || "";

      return {
        text,
        finishReason: candidate?.finishReason,
        usage: data.usageMetadata
          ? {
              promptTokens: data.usageMetadata.promptTokenCount || 0,
              completionTokens: data.usageMetadata.candidatesTokenCount || 0,
              totalTokens: data.usageMetadata.totalTokenCount || 0,
            }
          : undefined,
      };
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));
      if (err instanceof GeminiApiError || err instanceof GeminiConfigError) throw err;
      if (attempt < MAX_RETRIES) {
        console.warn(`[gemini] Attempt ${attempt + 1} failed, retrying:`, lastError.message);
        await sleep(RETRY_DELAY_MS * (attempt + 1));
      }
    }
  }

  throw lastError || new Error("Gemini: todas as tentativas falharam");
}

// ── Convenience: extract JSON from AI response ──────────────────────────────

export function extractJson<T = any>(text: string): T | null {
  // Remove markdown code fences
  const cleaned = text.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();

  // Try direct parse
  try {
    return JSON.parse(cleaned);
  } catch {
    // Try to find JSON object or array
    const objMatch = cleaned.match(/\{[\s\S]*\}/);
    if (objMatch) {
      try { return JSON.parse(objMatch[0]); } catch { /* fall through */ }
    }
    const arrMatch = cleaned.match(/\[[\s\S]*\]/);
    if (arrMatch) {
      try { return JSON.parse(arrMatch[0]); } catch { /* fall through */ }
    }
  }
  return null;
}

// ── Health check ─────────────────────────────────────────────────────────────

export async function healthCheck(): Promise<{ ok: boolean; provider: string; model: string; error?: string }> {
  try {
    const apiKey = getApiKey();
    const url = `${GEMINI_BASE_URL}/models/${DEFAULT_MODEL}?key=${apiKey}`;
    const res = await fetch(url);
    if (!res.ok) {
      return { ok: false, provider: "gemini", model: DEFAULT_MODEL, error: `Status ${res.status}` };
    }
    return { ok: true, provider: "gemini", model: DEFAULT_MODEL };
  } catch (err) {
    return { ok: false, provider: "gemini", model: DEFAULT_MODEL, error: String(err) };
  }
}
