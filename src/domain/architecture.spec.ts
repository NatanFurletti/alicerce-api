import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * A regra da ADR-001 verificada por teste, e não só por lint.
 *
 * O ESLint já bloqueia estes imports (ADR-008), mas um `eslint-disable` ou uma mudança
 * de configuração desarmaria a proteção silenciosamente. Este teste é a segunda
 * tranca: falha no `npm test`, independentemente do lint, e explica o porquê para quem
 * abrir o repositório.
 */
const SRC = join(__dirname, '..');

function filesIn(dir: string): string[] {
  const found: string[] = [];

  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) {
      found.push(...filesIn(path));
    } else if (entry.name.endsWith('.ts') && !entry.name.endsWith('.spec.ts')) {
      found.push(path);
    }
  }

  return found;
}

function importsOf(file: string): string[] {
  const content = readFileSync(file, 'utf8');
  return [...content.matchAll(/from\s+'([^']+)'/g)].map((match) => match[1] ?? '');
}

describe('fronteiras da arquitetura (ADR-001)', () => {
  const domainFiles = filesIn(join(SRC, 'domain'));
  const applicationFiles = filesIn(join(SRC, 'application'));

  it('encontra os arquivos das camadas — o teste não passa por vacuidade', () => {
    expect(domainFiles.length).toBeGreaterThan(10);
    expect(applicationFiles.length).toBeGreaterThan(5);
  });

  it('domain/ não importa framework, ORM nem infraestrutura', () => {
    const violations: string[] = [];

    for (const file of domainFiles) {
      for (const specifier of importsOf(file)) {
        if (
          specifier.startsWith('@nestjs/') ||
          specifier.includes('@prisma/client') ||
          specifier.includes('infra/') ||
          specifier.includes('application/')
        ) {
          violations.push(`${file} -> ${specifier}`);
        }
      }
    }

    expect(violations).toEqual([]);
  });

  it('application/ não importa framework nem implementações de infraestrutura', () => {
    const violations: string[] = [];

    for (const file of applicationFiles) {
      for (const specifier of importsOf(file)) {
        if (specifier.includes('@prisma/client') || specifier.includes('infra/')) {
          violations.push(`${file} -> ${specifier}`);
        }
      }
    }

    expect(violations).toEqual([]);
  });

  it('os casos de uso dependem de interfaces de repositório, não de classes concretas', () => {
    // Heurística simples e eficaz: nenhum caso de uso pode importar algo cujo nome
    // sugira implementação (Prisma*, InMemory*). O fake entra por injeção no teste.
    const violations: string[] = [];

    for (const file of applicationFiles) {
      const content = readFileSync(file, 'utf8');
      if (/\b(Prisma|InMemory)[A-Z]\w*Repository\b/.test(content)) {
        violations.push(file);
      }
    }

    expect(violations).toEqual([]);
  });
});
