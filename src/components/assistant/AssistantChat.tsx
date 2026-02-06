import { useState, useRef, useEffect, useCallback } from "react";
import { Send, Loader2, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import odinLogo from "@/assets/odin-logo.png";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useHousehold } from "@/hooks/useHousehold";
import ReactMarkdown from "react-markdown";
import { DestructiveActionConfirmation, DestructiveActionPreview } from "./DestructiveActionConfirmation";
import { deleteTransactionsBatch } from "@/services/destructiveActionsService";

type MessageStatus = "loading" | "done" | "error";

interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: Date;
  deletionPreview?: DestructiveActionPreview;
  status?: MessageStatus;
  requestId?: string;
  retryPayload?: { messages: { role: string; content: string }[]; quickAction?: string };
}


// Parse deletion preview from AI response
function parseDeletionPreview(content: string): DestructiveActionPreview | null {
  const match = content.match(/<!-- DELETION_PREVIEW:(.+?) -->/);
  if (match) {
    try {
      const data = JSON.parse(match[1]);
      return {
        actionType: "delete_transactions",
        count: data.count,
        transactionIds: data.transactionIds,
        householdName: data.householdName,
        householdId: data.householdId,
        rangeLabel: data.rangeLabel,
        sumAmount: data.sumAmount,
        topCategories: data.topCategories,
      };
    } catch (e) {
      console.error("Failed to parse deletion preview:", e);
    }
  }
  return null;
}

// Remove hidden preview data from displayed content
function cleanMessageContent(content: string): string {
  return content.replace(/<!-- DELETION_PREVIEW:.+? -->/g, "").trim();
}

export function AssistantChat() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [isTyping, setIsTyping] = useState(false);
  const [isInitializing, setIsInitializing] = useState(true);
  const [confirmationOpen, setConfirmationOpen] = useState(false);
  const [currentPreview, setCurrentPreview] = useState<DestructiveActionPreview | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const { toast } = useToast();
  const { currentHousehold, hasSelectedHousehold } = useHousehold();
  
  const previousHouseholdIdRef = useRef<string | null>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  // Reset chat when household changes
  useEffect(() => {
    const currentHouseholdId = currentHousehold?.id || null;
    
    if (previousHouseholdIdRef.current !== null && previousHouseholdIdRef.current !== currentHouseholdId) {
      console.log("Household changed, resetting AI chat context");
      setMessages([]);
      setIsInitializing(true);
    }
    
    previousHouseholdIdRef.current = currentHouseholdId;
  }, [currentHousehold?.id]);

  // Initialize with a greeting
  useEffect(() => {
    const initializeChat = async () => {
      if (!hasSelectedHousehold || !currentHousehold) {
        setMessages([{
          id: "no-household",
          role: "assistant",
          content: "Olá! Parece que você ainda não selecionou uma família. Por favor, selecione uma família para que eu possa analisar suas finanças. 🏠",
          timestamp: new Date(),
        }]);
        setIsInitializing(false);
        return;
      }

      setIsInitializing(true);
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session) {
          setMessages([{
            id: "1",
            role: "assistant",
            content: "Olá! Parece que você não está logado. Por favor, faça login para que eu possa analisar suas finanças. 🔐",
            timestamp: new Date(),
          }]);
          setIsInitializing(false);
          return;
        }

        await streamChat({
          messages: [{ role: "user", content: `Olá! Me dê uma análise rápida das finanças da família ${currentHousehold.name}.` }],
          isInitial: true,
        });
      } catch (error) {
        console.error("Error initializing chat:", error);
        const msg = error instanceof Error ? error.message : "";
        const isNetworkError = msg === "Failed to fetch" || msg.includes("NetworkError") || msg.includes("Load failed");
        setMessages([{
          id: "1",
          role: "assistant",
          content: isNetworkError
            ? `Olá! Sou o Odin, mas não consegui conectar ao servidor agora. Verifique sua internet e, se estiver em produção, se a chave **GEMINI_API_KEY** está configurada nas Edge Functions do Supabase. Como posso te ajudar? 💰`
            : `Olá! Sou o Odin, seu assistente financeiro da família **${currentHousehold.name}**. 🔒 Modo de Segurança está ativo. Como posso te ajudar? 💰`,
          timestamp: new Date(),
        }]);
        if (isNetworkError) {
          toast({
            title: "Conexão com o Odin falhou",
            description: "Verifique sua conexão e a configuração da Edge Function clara-chat (GEMINI_API_KEY nos Secrets).",
            variant: "destructive",
          });
        }
      }
      setIsInitializing(false);
    };

    initializeChat();
  }, [currentHousehold?.id, hasSelectedHousehold]);

  const appendAssistantLoadingMessage = useCallback((requestId: string): string => {
    const id = `loading-${requestId}-${Date.now()}`;
    setMessages((prev) => [...prev, {
      id,
      role: "assistant",
      content: "Processando…",
      timestamp: new Date(),
      status: "loading",
      requestId,
    }]);
    return id;
  }, []);

  const updateMessageById = useCallback((messageId: string, updates: { content?: string; status?: MessageStatus; deletionPreview?: DestructiveActionPreview | null }) => {
    setMessages((prev) => prev.map((m) =>
      m.id === messageId ? { ...m, ...updates } : m
    ));
  }, []);

  const setMessageErrorById = useCallback((messageId: string, content: string, retryPayload?: Message["retryPayload"]) => {
    setMessages((prev) => prev.map((m) =>
      m.id === messageId ? { ...m, content, status: "error" as MessageStatus, retryPayload } : m
    ));
  }, []);

  const streamChat = async ({ 
    messages: chatMessages, 
    isInitial = false,
    assistantMessageId,
    quickAction,
  }: { 
    messages: { role: string; content: string }[]; 
    isInitial?: boolean;
    assistantMessageId?: string;
    quickAction?: string;
  }) => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
      toast({
        title: "Sessão expirada",
        description: "Por favor, faça login novamente",
        variant: "destructive",
      });
      return;
    }

    if (!currentHousehold) {
      toast({
        title: "Nenhuma família selecionada",
        description: "Por favor, selecione uma família primeiro",
        variant: "destructive",
      });
      return;
    }

    const baseUrl = import.meta.env.VITE_SUPABASE_URL;
    const anonKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
    if (!baseUrl || baseUrl === "undefined") {
      throw new Error("VITE_SUPABASE_URL não configurada. Adicione no .env do projeto.");
    }
    if (!anonKey || anonKey === "undefined") {
      throw new Error("VITE_SUPABASE_PUBLISHABLE_KEY não configurada no .env.");
    }

    const resp = await fetch(`${baseUrl}/functions/v1/clara-chat`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${session.access_token}`,
        apikey: anonKey,
      },
      body: JSON.stringify({ 
        messages: chatMessages,
        householdId: currentHousehold.id,
        ...(quickAction ? { quickAction } : {}),
      }),
    });

    if (!resp.ok) {
      const error = await resp.json().catch(() => ({ error: "Erro desconhecido", code: "" }));
      
      if (resp.status === 403) {
        toast({
          title: "Acesso negado",
          description: "Você não tem permissão para acessar os dados desta família",
          variant: "destructive",
        });
        return;
      }
      if (resp.status === 503 && error.code === "AI_NOT_CONFIGURED") {
        toast({
          title: "Odin não configurado",
          description: "A chave Gemini (GEMINI_API_KEY) não está configurada nas Edge Functions do Supabase. Configure em: Dashboard → Edge Functions → Secrets.",
          variant: "destructive",
        });
        return;
      }
      
      throw new Error(error.error || "Falha ao conectar com o Odin");
    }

    if (!resp.body) throw new Error("No response body");

    const reader = resp.body.getReader();
    const decoder = new TextDecoder();
    let textBuffer = "";
    let assistantContent = "";
    const assistantId = assistantMessageId || `ast-${Date.now()}`;

    if (!isInitial && !assistantMessageId) {
      setMessages((prev) => [...prev, {
        id: assistantId,
        role: "assistant",
        content: "",
        timestamp: new Date(),
      }]);
    }

    const updateAssistantMessage = (content: string) => {
      assistantContent = content;
      const preview = parseDeletionPreview(content);
      const cleanContent = cleanMessageContent(content);

      if (assistantMessageId) {
        updateMessageById(assistantMessageId, {
          content: cleanContent,
          status: "done",
          deletionPreview: preview || undefined,
        });
      } else {
        setMessages((prev) => {
          const last = prev[prev.length - 1];
          if (last?.role === "assistant" && last.id === assistantId) {
            return prev.map((m) =>
              m.id === assistantId
                ? { ...m, content: cleanContent, status: "done" as MessageStatus, deletionPreview: preview || m.deletionPreview }
                : m
            );
          }
          if (last?.role === "assistant") {
            return prev.map((m, i) =>
              i === prev.length - 1
                ? { ...m, content: cleanContent, status: "done" as MessageStatus, deletionPreview: preview || m.deletionPreview }
                : m
            );
          }
          return [...prev, {
            id: assistantId,
            role: "assistant" as const,
            content: cleanContent,
            timestamp: new Date(),
            status: "done" as MessageStatus,
            deletionPreview: preview,
          }];
        });
      }
    };

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      
      textBuffer += decoder.decode(value, { stream: true });

      let newlineIndex: number;
      while ((newlineIndex = textBuffer.indexOf("\n")) !== -1) {
        let line = textBuffer.slice(0, newlineIndex);
        textBuffer = textBuffer.slice(newlineIndex + 1);

        if (line.endsWith("\r")) line = line.slice(0, -1);
        if (line.startsWith(":") || line.trim() === "") continue;
        if (!line.startsWith("data: ")) continue;

        const jsonStr = line.slice(6).trim();
        if (jsonStr === "[DONE]") break;

        try {
          const parsed = JSON.parse(jsonStr);
          const content = parsed.choices?.[0]?.delta?.content;
          if (content) {
            updateAssistantMessage(assistantContent + content);
          }
        } catch {
          textBuffer = line + "\n" + textBuffer;
          break;
        }
      }
    }

    // Final flush
    if (textBuffer.trim()) {
      for (let raw of textBuffer.split("\n")) {
        if (!raw) continue;
        if (raw.endsWith("\r")) raw = raw.slice(0, -1);
        if (raw.startsWith(":") || raw.trim() === "") continue;
        if (!raw.startsWith("data: ")) continue;
        const jsonStr = raw.slice(6).trim();
        if (jsonStr === "[DONE]") continue;
        try {
          const parsed = JSON.parse(jsonStr);
          const content = parsed.choices?.[0]?.delta?.content;
          if (content) {
            updateAssistantMessage(assistantContent + content);
          }
        } catch { /* ignore */ }
      }
    }
  };

  const handleSend = async () => {
    if (!input.trim() || isTyping) return;

    if (!currentHousehold) {
      toast({
        title: "Nenhuma família selecionada",
        description: "Por favor, selecione uma família primeiro",
        variant: "destructive",
      });
      return;
    }

    const userMessage: Message = {
      id: Date.now().toString(),
      role: "user",
      content: input,
      timestamp: new Date(),
    };

    setMessages(prev => [...prev, userMessage]);
    setInput("");
    setIsTyping(true);

    try {
      const conversationHistory = [
        ...messages.map(m => ({ role: m.role, content: m.content })),
        { role: "user", content: input },
      ];

      await streamChat({ messages: conversationHistory });
    } catch (error) {
      console.error("Error sending message:", error);
      const msg = error instanceof Error ? error.message : "";
      const isNetworkError = msg === "Failed to fetch" || msg.includes("NetworkError") || msg.includes("Load failed");
      toast({
        title: "Erro ao conectar com o Odin",
        description: isNetworkError
          ? "Verifique sua conexão. Se estiver em produção, confira se a Edge Function clara-chat está publicada e se GEMINI_API_KEY está nos Secrets do Supabase."
          : (msg || "Não foi possível enviar a mensagem"),
        variant: "destructive",
      });
      setMessages(prev => prev.filter(m => m.id !== userMessage.id));
    } finally {
      setIsTyping(false);
    }
  };

  const QUICK_ACTIONS: { label: string; quickAction: string }[] = [
    { label: "📊 Diagnóstico de economia", quickAction: "diagnostico_periodo_total" },
    { label: "🎯 Ver metas do mês", quickAction: "ver_metas_mes" },
    { label: "📋 Verificar pendências", quickAction: "verificar_pendencias" },
    { label: "📜 Listar regras automáticas", quickAction: "listar_regras" },
    { label: "💡 Sugestões de economia", quickAction: "diagnostico_periodo_total" },
  ];

  const handleQuickAction = async (label: string, quickAction: string) => {
    if (!currentHousehold || isTyping) return;

    const requestId = `qa-${Date.now()}`;
    const userMessage: Message = {
      id: `user-${requestId}`,
      role: "user",
      content: label,
      timestamp: new Date(),
    };
    setMessages((prev) => [...prev, userMessage]);

    const assistantId = appendAssistantLoadingMessage(requestId);
    setIsTyping(true);

    const chatMessages = [
      ...messages.map((m) => ({ role: m.role, content: m.content })),
      { role: "user" as const, content: label },
    ];
    const retryPayload = { messages: chatMessages, quickAction };

    try {
      await streamChat({
        messages: chatMessages,
        assistantMessageId: assistantId,
        quickAction,
      });
    } catch (error) {
      console.error("Quick action error:", error);
      const msg = error instanceof Error ? error.message : "Não foi possível concluir.";
      setMessageErrorById(assistantId, `**Falhou**\n\n${msg}`, retryPayload);
      toast({
        title: "Ação falhou",
        description: msg,
        variant: "destructive",
      });
    } finally {
      setIsTyping(false);
    }
  };

  const handleSuggestionClick = (suggestion: string) => {
    const match = QUICK_ACTIONS.find((a) => a.label === suggestion);
    if (match) {
      handleQuickAction(match.label, match.quickAction);
      return;
    }
    setInput(suggestion);
  };

  const handleRetry = async (message: Message) => {
    if (!message.retryPayload || isTyping) return;
    const { messages: chatMessages, quickAction } = message.retryPayload;
    updateMessageById(message.id, { content: "Processando…", status: "loading" });
    setIsTyping(true);
    try {
      await streamChat({
        messages: chatMessages,
        assistantMessageId: message.id,
        quickAction,
      });
    } catch (error) {
      const errMsg = error instanceof Error ? error.message : "Erro ao tentar novamente.";
      setMessageErrorById(message.id, `**Falhou**\n\n${errMsg}`, message.retryPayload);
      toast({ title: "Falhou de novo", description: errMsg, variant: "destructive" });
    } finally {
      setIsTyping(false);
    }
  };

  const handleDeletionClick = (preview: DestructiveActionPreview) => {
    setCurrentPreview(preview);
    setConfirmationOpen(true);
  };

  const handleConfirmDeletion = useCallback(async (preview: DestructiveActionPreview) => {
    setIsDeleting(true);
    try {
      const result = await deleteTransactionsBatch({
        householdId: preview.householdId,
        transactionIds: preview.transactionIds,
      });

      // Add result message to chat
      const resultMessage: Message = {
        id: Date.now().toString(),
        role: "assistant",
        content: result.success
          ? `✅ **${result.deletedCount} lançamentos** foram excluídos com sucesso da família **${preview.householdName}**!`
          : `⚠️ ${result.message}\n\n${result.failedIds.length > 0 ? `IDs com falha: ${result.failedIds.map(f => f.reason).join(", ")}` : ""}`,
        timestamp: new Date(),
      };

      setMessages(prev => [...prev, resultMessage]);
      setConfirmationOpen(false);
      setCurrentPreview(null);

      // Clear deletion previews from previous messages
      setMessages(prev => prev.map(m => ({ ...m, deletionPreview: undefined })));

    } catch (error) {
      toast({
        title: "Erro",
        description: error instanceof Error ? error.message : "Erro ao excluir lançamentos",
        variant: "destructive",
      });
    } finally {
      setIsDeleting(false);
    }
  }, [toast]);

  const handleCancelDeletion = useCallback(() => {
    setConfirmationOpen(false);
    setCurrentPreview(null);

    // Add cancellation message
    const cancelMessage: Message = {
      id: Date.now().toString(),
      role: "assistant",
      content: "🚫 Exclusão cancelada. Nenhum dado foi removido.",
      timestamp: new Date(),
    };
    setMessages(prev => [...prev, cancelMessage]);

    // Clear deletion previews
    setMessages(prev => prev.map(m => ({ ...m, deletionPreview: undefined })));
  }, []);

  if (isInitializing) {
    return (
      <div className="flex flex-col h-full">
        <div className="px-4 py-4 border-b border-border bg-card/50 backdrop-blur-xl">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full overflow-hidden bg-card">
              <img src={odinLogo} alt="Odin" className="w-full h-full object-cover" />
            </div>
            <div>
              <h1 className="text-lg font-bold text-foreground">Odin</h1>
              <p className="text-xs text-muted-foreground">
                {currentHousehold ? `Assistente da ${currentHousehold.name}` : "Seu assistente financeiro"}
              </p>
            </div>
          </div>
        </div>
        <div className="flex-1 flex items-center justify-center">
          <div className="flex flex-col items-center gap-3">
            <Loader2 className="w-8 h-8 text-accent animate-spin" />
            <p className="text-sm text-muted-foreground">
              {currentHousehold 
                ? `Analisando finanças da ${currentHousehold.name}...` 
                : "Carregando..."}
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="px-4 py-4 border-b border-border bg-card/50 backdrop-blur-xl">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full overflow-hidden bg-card">
            <img src={odinLogo} alt="Odin" className="w-full h-full object-cover" />
          </div>
          <div>
            <h1 className="text-lg font-bold text-foreground">Odin</h1>
            <p className="text-xs text-muted-foreground">
              {currentHousehold ? `Assistente da ${currentHousehold.name}` : "Seu assistente financeiro"}
            </p>
          </div>
          <div className="ml-auto flex items-center gap-1 px-2 py-1 bg-accent/10 rounded-full">
            <div className="w-2 h-2 rounded-full bg-accent animate-pulse" />
            <span className="text-xs text-accent font-medium">Modo Seguro</span>
          </div>
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4 scrollbar-hide">
        {messages.map((message) => (
          <div key={message.id}>
            <div
              className={cn(
                "animate-in-up",
                message.role === "user" ? "flex justify-end" : "flex justify-start"
              )}
            >
              <div
                className={cn(
                  "message-bubble",
                  message.role === "user" ? "user" : "assistant"
                )}
              >
                {message.role === "assistant" ? (
                  <>
                    {message.status === "loading" && (
                      <div className="flex items-center gap-2 text-muted-foreground text-sm">
                        <Loader2 className="w-4 h-4 animate-spin flex-shrink-0" />
                        <span>{message.content || "Processando…"}</span>
                      </div>
                    )}
                    {message.status !== "loading" && (
                      <div className="prose prose-sm dark:prose-invert max-w-none text-sm leading-relaxed [&>p]:mb-2 [&>ul]:mb-2 [&>ul]:ml-4 [&>ol]:mb-2 [&>ol]:ml-4 [&_strong]:text-accent [&_strong]:font-semibold">
                        <ReactMarkdown>{message.content}</ReactMarkdown>
                      </div>
                    )}
                    {message.status === "error" && message.retryPayload && (
                      <Button
                        variant="outline"
                        size="sm"
                        className="mt-2"
                        onClick={() => handleRetry(message)}
                        disabled={isTyping}
                      >
                        Tentar novamente
                      </Button>
                    )}
                  </>
                ) : (
                  <div className="text-sm leading-relaxed">{message.content}</div>
                )}
              </div>
            </div>
            
            {/* Deletion action button */}
            {message.deletionPreview && (
              <div className="flex justify-start mt-2 ml-2">
                <Button
                  variant="destructive"
                  size="sm"
                  onClick={() => handleDeletionClick(message.deletionPreview!)}
                  disabled={isDeleting}
                  className="flex items-center gap-2"
                >
                  {isDeleting ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Trash2 className="w-4 h-4" />
                  )}
                  Confirmar Exclusão ({message.deletionPreview.count})
                </Button>
              </div>
            )}
          </div>
        ))}

        {isTyping && (
          <div className="flex justify-start animate-fade-in">
            <div className="message-bubble assistant">
              <div className="flex gap-1">
                <span className="w-2 h-2 bg-muted-foreground rounded-full animate-bounce" style={{ animationDelay: "0ms" }} />
                <span className="w-2 h-2 bg-muted-foreground rounded-full animate-bounce" style={{ animationDelay: "150ms" }} />
                <span className="w-2 h-2 bg-muted-foreground rounded-full animate-bounce" style={{ animationDelay: "300ms" }} />
              </div>
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Quick actions - one loading message, then update with result */}
      <div className="px-4 py-2 border-t border-border">
        <div className="flex gap-2 overflow-x-auto scrollbar-hide pb-2">
          {QUICK_ACTIONS.map(({ label, quickAction }) => (
            <button
              key={quickAction}
              onClick={() => handleQuickAction(label, quickAction)}
              disabled={isTyping || !currentHousehold}
              className="flex-shrink-0 px-4 py-2 bg-muted/50 text-muted-foreground text-sm rounded-full hover:bg-muted transition-colors disabled:opacity-50"
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* Input */}
      <div className="p-4 border-t border-border bg-card/50 backdrop-blur-xl pb-safe">
        <div className="flex gap-3">
          <input
            type="text"
            placeholder={currentHousehold 
              ? `Pergunte sobre as finanças da ${currentHousehold.name}...` 
              : "Selecione uma família primeiro..."}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && handleSend()}
            disabled={isTyping || !currentHousehold}
            className="mobile-input flex-1"
          />
          <Button
            variant="accent"
            size="icon"
            onClick={handleSend}
            disabled={!input.trim() || isTyping || !currentHousehold}
          >
            {isTyping ? (
              <Loader2 className="w-5 h-5 animate-spin" />
            ) : (
              <Send className="w-5 h-5" />
            )}
          </Button>
        </div>
      </div>

      {/* Destructive Action Confirmation */}
      <DestructiveActionConfirmation
        preview={currentPreview}
        onConfirm={handleConfirmDeletion}
        onCancel={handleCancelDeletion}
        isOpen={confirmationOpen}
      />
    </div>
  );
}
