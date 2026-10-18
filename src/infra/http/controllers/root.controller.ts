import { Controller, Get, Redirect } from '@nestjs/common';
import { ApiExcludeEndpoint } from '@nestjs/swagger';

import { Public } from '../../auth/jwt-auth.guard';

/**
 * Raiz da aplicação: redireciona para a documentação interativa.
 *
 * Quem recebe o link do deploy costuma abrir a raiz, e um 404 ali parece API quebrada.
 * O redirect é 302 (temporário), não 301: o navegador guarda um 301 indefinidamente,
 * e a raiz deixaria de ser reaproveitável sem que os visitantes antigos percebessem.
 */
@Controller()
export class RootController {
  // Fora do Swagger: é navegação, não contrato da API.
  @ApiExcludeEndpoint()
  @Public()
  @Get()
  @Redirect('/docs', 302)
  root(): void {}
}
