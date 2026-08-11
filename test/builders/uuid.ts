import { createHash } from 'node:crypto';

/**
 * UUID determinístico a partir de um rótulo legível.
 *
 * O schema usa `@db.Uuid` — a restrição correta em produção, já que ids não devem ser
 * enumeráveis (ADR-016). Mas `'sim-1'` num teste comunica muito mais que
 * `'3f2504e0-4f89-41d3-9a0c-0305e82c3301'`.
 *
 * Este helper resolve os dois: o teste escreve `uuidFor('sim-1')` e sempre recebe o
 * mesmo UUID válido. Deriva de um hash do rótulo, então é estável entre execuções e
 * entre máquinas.
 */
export function uuidFor(label: string): string {
  const hex = createHash('sha256').update(label).digest('hex');

  // Formata como UUID v4: define a versão (4) e a variante (8-b).
  return [
    hex.slice(0, 8),
    hex.slice(8, 12),
    `4${hex.slice(13, 16)}`,
    `${((parseInt(hex[16] ?? '0', 16) & 0x3) | 0x8).toString(16)}${hex.slice(17, 20)}`,
    hex.slice(20, 32),
  ].join('-');
}
