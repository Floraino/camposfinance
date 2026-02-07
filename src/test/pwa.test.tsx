import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { BrowserRouter } from "react-router-dom";
import Offline from "@/pages/Offline";

describe("PWA", () => {
  describe("rota /offline", () => {
    it("renderiza página offline com mensagem e link para tentar novamente", () => {
      render(
        <BrowserRouter>
          <Offline />
        </BrowserRouter>
      );
      expect(screen.getByText(/você está offline/i)).toBeInTheDocument();
      expect(screen.getByRole("link", { name: /tentar novamente/i })).toHaveAttribute("href", "/");
    });
  });
});
