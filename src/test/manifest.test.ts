import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

describe("manifest.webmanifest", () => {
  it("existe e contém name, short_name, start_url, display e ícones", () => {
    const manifestPath = path.resolve(__dirname, "../../public/manifest.webmanifest");
    const content = readFileSync(manifestPath, "utf-8");
    const manifest = JSON.parse(content) as {
      name?: string;
      short_name?: string;
      start_url?: string;
      display?: string;
      icons?: Array<{ src: string; sizes: string; purpose?: string }>;
    };

    expect(manifest.name).toBeDefined();
    expect(manifest.short_name).toBeDefined();
    expect(manifest.start_url).toBe("/");
    expect(manifest.display).toBe("standalone");
    expect(Array.isArray(manifest.icons)).toBe(true);
    expect(manifest.icons!.length).toBeGreaterThanOrEqual(1);
    const anyIcon = manifest.icons!.find((i) => i.purpose === "any" || !i.purpose);
    expect(anyIcon?.src).toBeDefined();
    expect(anyIcon?.sizes).toBeDefined();
  });
});
