import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const TEMPLATES_DIR = join(__dirname, '../../../../../../templates');

interface TemplatePackageJson {
  name?: string;
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
}

function readTemplatePackageJson(template: string): TemplatePackageJson {
  const pkgPath = join(TEMPLATES_DIR, template, 'package.json');
  expect(existsSync(pkgPath), `missing package.json for ${template}`).toBe(true);
  return JSON.parse(readFileSync(pkgPath, 'utf8')) as TemplatePackageJson;
}

function readTemplateSource(template: string, relativePath: string): string {
  const filePath = join(TEMPLATES_DIR, template, relativePath);
  expect(existsSync(filePath), `missing ${relativePath} for ${template}`).toBe(true);
  return readFileSync(filePath, 'utf8');
}

function declaredDependencies(pkg: TemplatePackageJson): Record<string, string> {
  return { ...(pkg.dependencies ?? {}), ...(pkg.devDependencies ?? {}) };
}

function assertImportsDeclared(template: string, sourcePath: string): void {
  const pkg = readTemplatePackageJson(template);
  const deps = declaredDependencies(pkg);
  const source = readTemplateSource(template, sourcePath);

  const importRegex = /from\s+['"]([^'"]+)['"]/g;
  const importedPackages = new Set<string>();
  let match: RegExpExecArray | null;
  while ((match = importRegex.exec(source)) !== null) {
    const specifier = match[1];
    if (specifier.startsWith('.') || specifier.startsWith('/')) continue;
    const parts = specifier.split('/');
    const packageName = specifier.startsWith('@')
      ? parts.slice(0, 2).join('/')
      : parts[0];
    importedPackages.add(packageName);
  }

  for (const packageName of importedPackages) {
    expect(
      deps[packageName],
      `${template} imports ${packageName} in ${sourcePath} but does not declare it in package.json`
    ).toBeDefined();
    expect(
      deps[packageName],
      `${template} must not use a private workspace link for ${packageName}`
    ).not.toMatch(/^workspace:/);
  }
}

describe('template dependency validation', () => {
  it('declares every package imported by the DEX template config', () => {
    assertImportsDeclared('soroban-dex', 'src/lib/config.ts');
  });

  it('declares every package imported by the Soroban DeFi template config', () => {
    assertImportsDeclared('soroban-defi', 'src/lib/config.ts');
  });
});
