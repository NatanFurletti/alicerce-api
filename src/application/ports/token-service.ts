/**
 * Conteúdo de um token emitido pela aplicação.
 *
 * `sub` (subject) é o id do usuário — nome padronizado pela RFC 7519, e é o que
 * bibliotecas de JWT esperam encontrar.
 *
 * O `type` é a peça de segurança menos óbvia: sem ele, um refresh token — que vive
 * dias — seria aceito onde se espera um access token de 15 minutos, anulando a razão
 * de existirem dois. O guard confere o tipo, não só a assinatura.
 */
export interface TokenPayload {
  readonly sub: string;
  readonly type: 'access' | 'refresh';
}

export interface TokenPair {
  readonly accessToken: string;
  readonly refreshToken: string;
}

/**
 * Emissão e verificação de tokens.
 *
 * Porta para que a aplicação não dependa de `@nestjs/jwt`: os casos de uso falam de
 * "emitir um par de tokens", não de assinatura HS256.
 */
export interface TokenService {
  issuePair(userId: string): Promise<TokenPair>;

  /** Verifica assinatura, expiração **e** tipo. Lança `InvalidTokenError` se falhar. */
  verify(token: string, expectedType: TokenPayload['type']): Promise<TokenPayload>;
}
