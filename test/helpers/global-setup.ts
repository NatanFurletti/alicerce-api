import 'dotenv/config';

import { applyMigrations } from './database';

/**
 * Roda uma vez, antes de toda a suíte e2e.
 *
 * Aplicar as migrations aqui — e não dentro de cada arquivo de teste — evita corrida
 * entre suítes e mantém os specs livres de ordem de import.
 */
export default function globalSetup(): void {
  applyMigrations();
}
