import { Link } from "react-router-dom";
import { WifiOff } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function Offline() {
  return (
    <div className="min-h-screen bg-background flex flex-col items-center justify-center p-6 text-center">
      <WifiOff className="w-16 h-16 text-muted-foreground mb-4" />
      <h1 className="text-xl font-semibold text-foreground mb-2">Você está offline</h1>
      <p className="text-muted-foreground mb-6 max-w-sm">
        Conecte-se à internet para continuar usando o Campos Finance.
      </p>
      <Button asChild>
        <Link to="/">Tentar novamente</Link>
      </Button>
    </div>
  );
}
