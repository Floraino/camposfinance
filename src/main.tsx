import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";
import { initializeMobileApp } from "./lib/mobileInit";

// Initialize mobile-specific features if running on native platform
initializeMobileApp().catch(console.error);

createRoot(document.getElementById("root")!).render(<App />);
