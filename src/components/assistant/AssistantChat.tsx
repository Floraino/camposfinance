import { useState, useRef, useEffect } from "react";
import { Send, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import odinLogo from "@/assets/odin-logo.png";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import ReactMarkdown from "react-markdown";

interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: Date;
}

const CHAT_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/clara-chat`;

export function AssistantChat() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [isTyping, setIsTyping] = useState(false);
  const [isInitializing, setIsInitializing] = useState(true);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const { toast } = useToast();

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  // Initialize with a greeting from Clara
  useEffect(() => {
    const initializeChat = async () => {
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

        // Send initial message to get personalized greeting
        await streamChat({
          messages: [{ role: "user", content: "Olá! Me dê uma análise rápida das minhas finanças." }],
          isInitial: true,
        });
      } catch (error) {
        console.error("Error initializing chat:", error);
        setMessages([{
          id: "1",
          role: "assistant",
          content: "Olá! Sou o Odin, seu assistente financeiro. Como posso te ajudar hoje? 💰",
          timestamp: new Date(),
        }]);
      }
      setIsInitializing(false);
    };

    initializeChat();
  }, []);

  const streamChat = async ({ 
    messages: chatMessages, 
    isInitial = false 
  }: { 
    messages: { role: string; content: string }[]; 
    isInitial?: boolean;
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

    const resp = await fetch(CHAT_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${session.access_token}`,
      },
      body: JSON.stringify({ messages: chatMessages }),
    });

    if (!resp.ok) {
      const error = await resp.json().catch(() => ({ error: "Erro desconhecido" }));
      throw new Error(error.error || "Falha ao conectar com a Clara");
    }

    if (!resp.body) throw new Error("No response body");

    const reader = resp.body.getReader();
    const decoder = new TextDecoder();
    let textBuffer = "";
    let assistantContent = "";
    const assistantId = Date.now().toString();

    // Add initial assistant message
    if (!isInitial) {
      setMessages(prev => [...prev, {
        id: assistantId,
        role: "assistant",
        content: "",
        timestamp: new Date(),
      }]);
    }

    const updateAssistantMessage = (content: string) => {
      assistantContent = content;
      setMessages(prev => {
        const last = prev[prev.length - 1];
        if (last?.role === "assistant") {
          return prev.map((m, i) => 
            i === prev.length - 1 ? { ...m, content: assistantContent } : m
          );
        }
        return [...prev, {
          id: assistantId,
          role: "assistant",
          content: assistantContent,
          timestamp: new Date(),
        }];
      });
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
      // Build conversation history for context
      const conversationHistory = [
        ...messages.map(m => ({ role: m.role, content: m.content })),
        { role: "user", content: input },
      ];

      await streamChat({ messages: conversationHistory });
    } catch (error) {
      console.error("Error sending message:", error);
      toast({
        title: "Erro",
        description: error instanceof Error ? error.message : "Não foi possível enviar a mensagem",
        variant: "destructive",
      });
      // Remove the failed user message
      setMessages(prev => prev.filter(m => m.id !== userMessage.id));
    } finally {
      setIsTyping(false);
    }
  };

  const handleSuggestionClick = (suggestion: string) => {
    setInput(suggestion);
  };

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
              <p className="text-xs text-muted-foreground">Seu assistente financeiro</p>
            </div>
          </div>
        </div>
        <div className="flex-1 flex items-center justify-center">
          <div className="flex flex-col items-center gap-3">
            <Loader2 className="w-8 h-8 text-accent animate-spin" />
            <p className="text-sm text-muted-foreground">Analisando suas finanças...</p>
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
            <p className="text-xs text-muted-foreground">Seu assistente financeiro</p>
          </div>
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4 scrollbar-hide">
        {messages.map((message) => (
          <div
            key={message.id}
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
                <div className="prose prose-sm dark:prose-invert max-w-none text-sm leading-relaxed [&>p]:mb-2 [&>ul]:mb-2 [&>ul]:ml-4 [&>ol]:mb-2 [&>ol]:ml-4 [&_strong]:text-accent [&_strong]:font-semibold">
                  <ReactMarkdown>{message.content}</ReactMarkdown>
                </div>
              ) : (
                <div className="text-sm leading-relaxed">{message.content}</div>
              )}
            </div>
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

      {/* Quick Suggestions */}
      <div className="px-4 py-2 border-t border-border">
        <div className="flex gap-2 overflow-x-auto scrollbar-hide pb-2">
          {["Como economizar?", "Resumo do mês", "Categorizar lançamentos", "Comparar com mês passado"].map((suggestion) => (
            <button
              key={suggestion}
              onClick={() => handleSuggestionClick(suggestion)}
              className="flex-shrink-0 px-4 py-2 bg-muted/50 text-muted-foreground text-sm rounded-full hover:bg-muted transition-colors"
            >
              {suggestion}
            </button>
          ))}
        </div>
      </div>

      {/* Input */}
      <div className="p-4 border-t border-border bg-card/50 backdrop-blur-xl pb-safe">
        <div className="flex gap-3">
          <input
            type="text"
            placeholder="Pergunte algo sobre suas finanças..."
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && handleSend()}
            disabled={isTyping}
            className="mobile-input flex-1"
          />
          <Button
            variant="accent"
            size="icon"
            onClick={handleSend}
            disabled={!input.trim() || isTyping}
          >
            {isTyping ? (
              <Loader2 className="w-5 h-5 animate-spin" />
            ) : (
              <Send className="w-5 h-5" />
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}
