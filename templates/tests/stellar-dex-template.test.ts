import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, resolve } from "node:path";

const TEMPLATE_ROOT = resolve(__dirname, "..", "stellar-dex");
const SRC_ROOT = join(TEMPLATE_ROOT, "src");

function collectSourceFiles(dir: string): string[] {
  const entries = readdirSync(dir);
  const files: string[] = [];
  for (const entry of entries) {
    const fullPath = join(dir, entry);
    if (statSync(fullPath).isDirectory()) {
      files.push(...collectSourceFiles(fullPath));
    } else if (/\.(ts|tsx|js|jsx)$/.test(entry)) {
      files.push(fullPath);
    }
  }
  return files;
}

function extractImports(source: string): string[] {
  const specifiers: string[] = [];
  const importRegex = /(?:import|export)\s+(?:[^'"]*?\s+from\s+)?["']([^"']+)["']/g;
  let match: RegExpExecArray | null;
  while ((match = importRegex.exec(source)) !== null) {
    specifiers.push(match[1]);
  }
  return specifiers;
}

function packageName(specifier: string): string | null {
  if (specifier.startsWith(".") || specifier.startsWith("/")) {
    return null;
  }
  const parts = specifier.split("/");
  return specifier.startsWith("@") ? parts.slice(0, 2).join("/") : parts[0];
}

describe("stellar-dex template", () => {
  it("declares every imported package in package.json", () => {
    const pkg = JSON.parse(
      readFileSync(join(TEMPLATE_ROOT, "package.json"), "utf8"),
    ) as {
      dependencies?: Record<string, string>;
      devDependencies?: Record<string, string>;
    };
    const declared = new Set([
      ...Object.keys(pkg.dependencies ?? {}),
      ...Object.keys(pkg.devDependencies ?? {}),
    ]);

    const undeclared = new Set<string>();
    for (const file of collectSourceFiles(SRC_ROOT)) {
      const source = readFileSync(file, "utf8");
      for (const specifier of extractImports(source)) {
        const name = packageName(specifier);
        if (name && !declared.has(name)) {
          undeclared.add(name);
        }
      }
    }

    expect([...undeclared]).toEqual([]);
  });

  it("does not use private workspace links in package.json", () => {
    const raw = readFileSync(join(TEMPLATE_ROOT, "package.json"), "utf8");
    expect(raw).not.toMatch(/workspace:/);
    expect(raw).not.toMatch(/file:\.\./);
  });
});
