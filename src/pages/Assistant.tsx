import { MobileLayout } from "@/components/layout/MobileLayout";
import { AssistantChat } from "@/components/assistant/AssistantChat";

export default function Assistant() {
  return (
    <MobileLayout>
      <div className="h-[calc(100vh-6rem)] pt-safe">
        <AssistantChat />
      </div>
    </MobileLayout>
  );
}
