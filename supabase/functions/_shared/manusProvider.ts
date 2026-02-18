/**
 * Manus AI Provider - Unified AI layer for all Edge Functions.
 *
 * Migrated from Google Gemini API to Manus AI.
 * Uses Manus AI API via REST (task-based model).
 *
 * Models:
 *   - manus-1.6 (default) → OCR / vision (scan-receipt)
 *   - manus-1.6 → CSV analysis, chat, batch categorization
 *   - manus-1.6-lite → single categorization (lightweight)
 *
 * Env: MANUS_API_KEY (required in Supabase Edge Function Secrets)
 *      MANUS_BASE_URL (optional, default: https://api.manus.ai)
 *      MANUS_MODEL (optional, default: manus-1.6)
 */

// @deno-types="https://deno.land/x/types/index.d.ts"
/// <reference lib="deno.ns" />

// ── Constants ────────────────────────────────────────────────────────────────
const MANUS_BASE_URL = Deno.env.get("MANUS_BASE_URL") || "https://api.manus.ai";
const DEFAULT_MODEL = Deno.env.get("MANUS_MODEL") || "manus-1.6";
const MAX_RETRIES = 2;
const RETRY_DELAY_MS = 1000;
const POLL_INTERVAL_MS = 500; // Polling interval for task status
const MAX_POLL_ATTEMPTS = 120; // Max 60 seconds (120 * 500ms)
const MAX_TASK_WAIT_MS = 60000; // Max 60 seconds total wait

// ── Types (compatíveis com geminiProvider) ────────────────────────────────────
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

// ── Manus API Types ──────────────────────────────────────────────────────────
interface ManusTaskResponse {
  task_id: string;
  task_title?: string;
  task_url?: string;
  share_url?: string;
}

interface ManusTask {
  id: string;
  status: "pending" | "running" | "completed" | "failed";
  error?: string;
  output?: ManusTaskMessage[];
  credit_usage?: number;
}

interface ManusTaskMessage {
  id: string;
  role: "user" | "assistant";
  content: ManusMessageContent[];
}

interface ManusMessageContent {
  type: "output_text" | "output_file";
  text?: string;
  fileUrl?: string;
  fileName?: string;
  mimeType?: string;
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function getApiKey(): string {
  const key = Deno.env.get("MANUS_API_KEY");
  if (!key) {
    throw new ManusConfigError(
      "MANUS_API_KEY não está configurada. " +
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

// Alias para compatibilidade
export const ManusConfigError = GeminiConfigError;
export const ManusApiError = GeminiApiError;

async function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

// ── Manus API Helpers ────────────────────────────────────────────────────────

async function createTask(
  prompt: string,
  attachments?: Array<{ filename: string; fileData: string }>,
  systemInstruction?: string,
  model?: string
): Promise<ManusTaskResponse> {
  const apiKey = getApiKey();
  const url = `${MANUS_BASE_URL}/v1/tasks`;

  const fullPrompt = systemInstruction
    ? `${systemInstruction}\n\n${prompt}`
    : prompt;

  const body: any = {
    prompt: fullPrompt,
    agentProfile: model || DEFAULT_MODEL,
    taskMode: "chat",
    hideInTaskList: true,
  };

  if (attachments && attachments.length > 0) {
    body.attachments = attachments;
  }

  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "API_KEY": apiKey,
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const errText = await response.text();
    if (response.status === 401 || response.status === 403) {
      throw new GeminiApiError(
        "MANUS_API_KEY inválida ou sem permissão. Verifique a chave no Manus Dashboard.",
        response.status,
        "INVALID_API_KEY"
      );
    }
    if (response.status === 429) {
      throw new GeminiApiError(
        "Muitas requisições. Aguarde um momento.",
        429,
        "RATE_LIMITED"
      );
    }
    throw new GeminiApiError(
      `Manus API retornou status ${response.status}: ${errText.substring(0, 300)}`,
      response.status,
      "AI_ERROR"
    );
  }

  return await response.json();
}

async function getTask(taskId: string): Promise<ManusTask> {
  const apiKey = getApiKey();
  const url = `${MANUS_BASE_URL}/v1/tasks/${taskId}`;

  const response = await fetch(url, {
    method: "GET",
    headers: {
      "API_KEY": apiKey,
    },
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new GeminiApiError(
      `Erro ao obter task ${taskId}: ${errText.substring(0, 300)}`,
      response.status,
      "AI_ERROR"
    );
  }

  return await response.json();
}

async function waitForTaskCompletion(
  taskId: string,
  onProgress?: (status: string) => void
): Promise<ManusTask> {
  const startTime = Date.now();
  let attempts = 0;

  while (attempts < MAX_POLL_ATTEMPTS) {
    if (Date.now() - startTime > MAX_TASK_WAIT_MS) {
      throw new GeminiApiError(
        `Task ${taskId} não completou em ${MAX_TASK_WAIT_MS}ms`,
        408,
        "TIMEOUT"
      );
    }

    const task = await getTask(taskId);
    onProgress?.(task.status);

    if (task.status === "completed") {
      return task;
    }

    if (task.status === "failed") {
      throw new GeminiApiError(
        task.error || `Task ${taskId} falhou`,
        500,
        "AI_ERROR"
      );
    }

    // Still pending or running, wait and retry
    await sleep(POLL_INTERVAL_MS);
    attempts++;
  }

  throw new GeminiApiError(
    `Task ${taskId} não completou após ${attempts} tentativas`,
    408,
    "TIMEOUT"
  );
}

function extractTextFromTask(task: ManusTask): string {
  if (!task.output || task.output.length === 0) {
    return "";
  }

  // Get the last assistant message
  const assistantMessages = task.output.filter((msg) => msg.role === "assistant");
  if (assistantMessages.length === 0) {
    return "";
  }

  const lastMessage = assistantMessages[assistantMessages.length - 1];
  const textParts = lastMessage.content
    .filter((c) => c.type === "output_text" && c.text)
    .map((c) => c.text!);

  return textParts.join("\n");
}

// ── Text Generation ──────────────────────────────────────────────────────────

export async function generateText(req: GeminiTextRequest): Promise<GeminiResponse> {
  let lastError: Error | null = null;

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      const taskResponse = await createTask(
        req.prompt,
        undefined,
        req.systemInstruction,
        req.model
      );

      const task = await waitForTaskCompletion(taskResponse.task_id);
      const text = extractTextFromTask(task);

      return {
        text,
        finishReason: task.status === "completed" ? "stop" : undefined,
        usage: task.credit_usage
          ? {
              promptTokens: 0, // Manus não expõe token breakdown
              completionTokens: 0,
              totalTokens: task.credit_usage,
            }
          : undefined,
      };
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));
      if (err instanceof GeminiApiError || err instanceof GeminiConfigError) {
        // Don't retry on auth/config errors or rate limits (except 429 with backoff)
        if (err instanceof GeminiApiError && err.status === 429 && attempt < MAX_RETRIES) {
          await sleep(RETRY_DELAY_MS * (attempt + 1));
          continue;
        }
        throw err;
      }
      if (attempt < MAX_RETRIES) {
        console.warn(`[manus] Attempt ${attempt + 1} failed, retrying:`, lastError.message);
        await sleep(RETRY_DELAY_MS * (attempt + 1));
      }
    }
  }

  throw lastError || new Error("Manus: todas as tentativas falharam");
}

// ── Vision (OCR) ─────────────────────────────────────────────────────────────

export async function generateFromImage(req: GeminiVisionRequest): Promise<GeminiResponse> {
  let lastError: Error | null = null;

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      // Convert base64 to Manus format: data:<mime_type>;base64,<encoded_content>
      const fileData = `data:${req.mimeType || "image/jpeg"};base64,${req.imageBase64}`;

      const attachments = [
        {
          filename: "image.jpg",
          fileData,
        },
      ];

      const fullPrompt = req.systemInstruction
        ? `${req.systemInstruction}\n\n${req.prompt}`
        : req.prompt;

      const taskResponse = await createTask(
        fullPrompt,
        attachments,
        undefined, // System instruction já está no prompt
        req.model
      );

      const task = await waitForTaskCompletion(taskResponse.task_id);
      const text = extractTextFromTask(task);

      return {
        text,
        finishReason: task.status === "completed" ? "stop" : undefined,
        usage: task.credit_usage
          ? {
              promptTokens: 0,
              completionTokens: 0,
              totalTokens: task.credit_usage,
            }
          : undefined,
      };
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));
      if (err instanceof GeminiApiError || err instanceof GeminiConfigError) {
        if (err instanceof GeminiApiError && err.status === 429 && attempt < MAX_RETRIES) {
          await sleep(RETRY_DELAY_MS * (attempt + 1));
          continue;
        }
        throw err;
      }
      if (attempt < MAX_RETRIES) {
        console.warn(`[manus] Attempt ${attempt + 1} failed, retrying:`, lastError.message);
        await sleep(RETRY_DELAY_MS * (attempt + 1));
      }
    }
  }

  throw lastError || new Error("Manus: todas as tentativas falharam");
}

// ── Streaming (for Clara chat) ───────────────────────────────────────────────

export async function generateStream(
  req: GeminiStreamRequest
): Promise<Response> {
  const apiKey = getApiKey();

  // Convert messages to a single prompt
  const messagesText = req.messages
    .map((msg) => {
      const role = msg.role === "assistant" ? "Assistant" : "User";
      return `${role}: ${msg.content}`;
    })
    .join("\n\n");

  const fullPrompt = req.systemInstruction
    ? `${req.systemInstruction}\n\n${messagesText}`
    : messagesText;

  try {
    const taskResponse = await createTask(
      fullPrompt,
      undefined,
      undefined,
      req.model
    );

    // Create a ReadableStream that polls for task completion and emits SSE events
    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      async start(controller) {
        try {
          let lastTextLength = 0;
          const startTime = Date.now();
          let attempts = 0;

          while (attempts < MAX_POLL_ATTEMPTS) {
            if (Date.now() - startTime > MAX_TASK_WAIT_MS) {
              controller.error(new Error("Stream timeout"));
              return;
            }

            const task = await getTask(taskResponse.task_id);

            if (task.status === "failed") {
              controller.error(
                new Error(task.error || `Task ${taskResponse.task_id} falhou`)
              );
              return;
            }

            if (task.status === "completed" && task.output) {
              // Extract text incrementally
              const assistantMessages = task.output.filter(
                (msg) => msg.role === "assistant"
              );
              if (assistantMessages.length > 0) {
                const lastMessage =
                  assistantMessages[assistantMessages.length - 1];
                const textParts = lastMessage.content
                  .filter((c) => c.type === "output_text" && c.text)
                  .map((c) => c.text!);
                const currentText = textParts.join("\n");

                // Emit new text chunks
                if (currentText.length > lastTextLength) {
                  const newText = currentText.slice(lastTextLength);
                  // Split into smaller chunks for streaming effect
                  const chunkSize = 10; // Characters per chunk
                  for (let i = 0; i < newText.length; i += chunkSize) {
                    const chunk = newText.slice(i, i + chunkSize);
                    const openaiEvent = JSON.stringify({
                      choices: [{ delta: { content: chunk } }],
                    });
                    controller.enqueue(encoder.encode(`data: ${openaiEvent}\n\n`));
                  }
                  lastTextLength = currentText.length;
                }

                // Task completed, send [DONE]
                controller.enqueue(encoder.encode("data: [DONE]\n\n"));
                controller.close();
                return;
              }
            }

            // Still processing, wait and retry
            await sleep(POLL_INTERVAL_MS);
            attempts++;
          }

          // Timeout
          controller.error(new Error("Task não completou a tempo"));
        } catch (error) {
          console.error("[manus] Stream error:", error);
          controller.error(error);
        }
      },
    });

    return new Response(stream, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
      },
    });
  } catch (err) {
    if (err instanceof GeminiApiError) {
      throw err;
    }
    throw new GeminiApiError(
      `Manus stream error: ${err instanceof Error ? err.message : String(err)}`,
      500,
      "AI_ERROR"
    );
  }
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
      try {
        return JSON.parse(objMatch[0]);
      } catch {
        /* fall through */
      }
    }
    const arrMatch = cleaned.match(/\[[\s\S]*\]/);
    if (arrMatch) {
      try {
        return JSON.parse(arrMatch[0]);
      } catch {
        /* fall through */
      }
    }
  }
  return null;
}

// ── Health check ─────────────────────────────────────────────────────────────

export async function healthCheck(): Promise<{
  ok: boolean;
  provider: string;
  model: string;
  error?: string;
}> {
  try {
    const apiKey = getApiKey();
    // Try to create a simple task to verify API key
    const testPrompt = "Hello";
    const taskResponse = await createTask(testPrompt, undefined, undefined, DEFAULT_MODEL);
    // Don't wait for completion, just verify we can create tasks
    return { ok: true, provider: "manus", model: DEFAULT_MODEL };
  } catch (err) {
    return {
      ok: false,
      provider: "manus",
      model: DEFAULT_MODEL,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}
