/**
 * Tokens de injeção para os contratos de repositório.
 *
 * Interfaces do TypeScript não existem em runtime, então não servem como token de DI.
 * Estes símbolos preenchem essa lacuna — e vivem no domínio, junto das interfaces que
 * nomeiam, e não em `infra/`: o token faz parte do contrato, e quem o consome (o caso
 * de uso) é código de aplicação, não de infraestrutura.
 *
 * São `const` de string e não `Symbol` de propósito: aparecem legíveis nas mensagens
 * de erro do Nest quando um provider não está registrado.
 */
export const USER_REPOSITORY = 'UserRepository';
export const SIMULATION_REPOSITORY = 'SimulationRepository';
export const EXTRA_PAYMENT_REPOSITORY = 'ExtraPaymentRepository';
