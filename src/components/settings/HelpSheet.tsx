import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";

interface HelpSheetProps {
  open: boolean;
  onClose: () => void;
}

const faqs = [
  {
    question: "Como adiciono uma nova despesa?",
    answer: "Toque no botão '+' na tela principal ou vá em 'Adicionar' no menu inferior. Preencha os detalhes como valor, descrição e categoria, depois toque em 'Salvar'.",
  },
  {
    question: "Como edito ou excluo uma transação?",
    answer: "Na tela de Transações, toque na transação que deseja editar. Um menu aparecerá com opções para editar ou excluir.",
  },
  {
    question: "O que são despesas recorrentes?",
    answer: "Despesas recorrentes são gastos que acontecem regularmente, como aluguel, contas de luz ou assinaturas. Marcar como recorrente ajuda a visualizar melhor seus gastos fixos.",
  },
  {
    question: "Como funciona o assistente Odin?",
    answer: "Odin é nosso assistente de inteligência artificial que ajuda a analisar seus gastos e responder perguntas sobre suas finanças. Acesse ele pelo menu 'Assistente'.",
  },
  {
    question: "Posso escanear recibos?",
    answer: "Sim! Na tela de adicionar transação, use a opção de scanner para fotografar um recibo. A IA tentará extrair automaticamente as informações.",
  },
  {
    question: "Como adiciono membros da família?",
    answer: "Vá em Ajustes > Membros da Casa. Lá você pode adicionar outros membros da família para compartilhar o controle de gastos da casa.",
  },
  {
    question: "Meus dados estão seguros?",
    answer: "Sim! Seus dados são armazenados de forma segura com criptografia e backup automático. Apenas você e os membros que você autorizar podem acessar suas informações.",
  },
  {
    question: "Como exporto meus dados?",
    answer: "Vá em Ajustes > Exportar Relatório. Escolha o período e formato (CSV ou JSON) para baixar suas transações.",
  },
];

export function HelpSheet({ open, onClose }: HelpSheetProps) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 animate-fade-in">
      <div 
        className="absolute inset-0 bg-background/80 backdrop-blur-sm"
        onClick={onClose}
      />
      
      <div className="absolute bottom-0 left-0 right-0 bg-card rounded-t-3xl animate-slide-up max-h-[85vh] overflow-hidden flex flex-col">
        <div className="flex justify-center pt-3 pb-2">
          <div className="w-12 h-1.5 bg-muted rounded-full" />
        </div>
        
        <div className="flex items-center justify-between px-4 pb-4 border-b border-border">
          <h2 className="text-xl font-bold text-foreground">Ajuda</h2>
          <Button variant="ghost" size="icon-sm" onClick={onClose}>
            <X className="w-5 h-5" />
          </Button>
        </div>

        <div className="flex-1 overflow-y-auto p-4 pb-safe">
          <p className="text-muted-foreground mb-4">
            Perguntas frequentes sobre o CasaCampos
          </p>
          
          <Accordion type="single" collapsible className="space-y-2">
            {faqs.map((faq, index) => (
              <AccordionItem 
                key={index} 
                value={`item-${index}`}
                className="border border-border rounded-xl px-4 data-[state=open]:bg-muted/30"
              >
                <AccordionTrigger className="text-left text-sm font-medium hover:no-underline py-4">
                  {faq.question}
                </AccordionTrigger>
                <AccordionContent className="text-muted-foreground text-sm pb-4">
                  {faq.answer}
                </AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>

          <div className="mt-6 p-4 bg-primary/10 rounded-xl border border-primary/20">
            <p className="font-medium text-foreground mb-1">Precisa de mais ajuda?</p>
            <p className="text-sm text-muted-foreground">
              Entre em contato conosco pelo email suporte@casacampos.app
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
