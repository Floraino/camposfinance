import { useState, useRef, useEffect } from "react";
import { Send, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: Date;
}

const initialMessages: Message[] = [
  {
    id: "1",
    role: "assistant",
    content: "Olá! Sou a Clara, sua assistente financeira pessoal. 🏠✨\n\nAnalisei seus gastos e percebi algumas coisas interessantes:\n\n• Você gastou **15% mais** com alimentação fora de casa este mês\n• Há **3 assinaturas** recorrentes que você pode revisar\n• Seu gasto com energia **diminuiu 8%** - ótimo trabalho!\n\nComo posso te ajudar hoje?",
    timestamp: new Date(),
  },
];

export function AssistantChat() {
  const [messages, setMessages] = useState<Message[]>(initialMessages);
  const [input, setInput] = useState("");
  const [isTyping, setIsTyping] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const handleSend = () => {
    if (!input.trim()) return;

    const userMessage: Message = {
      id: Date.now().toString(),
      role: "user",
      content: input,
      timestamp: new Date(),
    };

    setMessages((prev) => [...prev, userMessage]);
    setInput("");
    setIsTyping(true);

    // Simula resposta da IA
    setTimeout(() => {
      const responses = [
        "Entendi! Vou analisar isso para você. Baseado nos seus últimos 3 meses, posso ver que seus gastos com **transporte** aumentaram significativamente. Você considerou alternativas como carona ou transporte público em alguns dias?",
        "Boa pergunta! Olhando para seus dados, você tem em média **R$ 850** livres no final do mês após os gastos fixos. Posso te ajudar a criar uma meta de economia se quiser!",
        "Claro! Aqui estão as suas maiores categorias de gasto:\n\n1. 🏠 **Contas Fixas** - R$ 1.850\n2. 🍕 **Alimentação** - R$ 980\n3. 🚗 **Transporte** - R$ 450\n\nQuer que eu sugira formas de economizar em alguma delas?",
        "Percebi que você tem **assinaturas sobrepostas** de streaming. Netflix + Prime + Disney+ somam R$ 85/mês. Você usa todas elas regularmente? Talvez valha revisar!",
      ];

      const randomResponse = responses[Math.floor(Math.random() * responses.length)];

      const assistantMessage: Message = {
        id: (Date.now() + 1).toString(),
        role: "assistant",
        content: randomResponse,
        timestamp: new Date(),
      };

      setMessages((prev) => [...prev, assistantMessage]);
      setIsTyping(false);
    }, 1500);
  };

  const formatContent = (content: string) => {
    // Simple markdown-like formatting
    return content
      .split("\n")
      .map((line, i) => {
        // Bold text
        const formattedLine = line.replace(
          /\*\*(.*?)\*\*/g,
          '<strong class="font-semibold text-accent">$1</strong>'
        );
        return (
          <span
            key={i}
            dangerouslySetInnerHTML={{ __html: formattedLine }}
            className="block"
          />
        );
      });
  };

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="px-4 py-4 border-b border-border bg-card/50 backdrop-blur-xl">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-accent/20 flex items-center justify-center">
            <Sparkles className="w-5 h-5 text-accent" />
          </div>
          <div>
            <h1 className="text-lg font-bold text-foreground">Clara</h1>
            <p className="text-xs text-muted-foreground">Sua assistente financeira</p>
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
              <div className="text-sm leading-relaxed">
                {formatContent(message.content)}
              </div>
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
          {["Como economizar?", "Resumo do mês", "Gastos por categoria"].map((suggestion) => (
            <button
              key={suggestion}
              onClick={() => setInput(suggestion)}
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
            onKeyDown={(e) => e.key === "Enter" && handleSend()}
            className="mobile-input flex-1"
          />
          <Button
            variant="accent"
            size="icon"
            onClick={handleSend}
            disabled={!input.trim()}
          >
            <Send className="w-5 h-5" />
          </Button>
        </div>
      </div>
    </div>
  );
}
