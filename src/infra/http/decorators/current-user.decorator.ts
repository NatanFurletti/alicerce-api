import { createParamDecorator, type ExecutionContext } from '@nestjs/common';

import type { AuthenticatedRequest } from '../../auth/jwt-auth.guard';

/**
 * Injeta o id do usuário autenticado no parâmetro do controller.
 *
 * O guard já colocou o usuário na requisição; este decorator apenas o expõe de forma
 * tipada. O ganho não é de digitação: o controller passa a **não precisar olhar o
 * corpo da requisição** para descobrir de quem é a sessão, então não existe caminho
 * para ler um `userId` vindo do cliente por engano — que é a falha de autorização
 * clássica.
 *
 * Lança se o usuário estiver ausente. Isso só acontece se alguém usar o decorator numa
 * rota `@Public()`, e falhar alto é melhor que passar `undefined` adiante e virar uma
 * consulta sem escopo.
 */
export const CurrentUserId = createParamDecorator(
  (_data: unknown, context: ExecutionContext): string => {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const userId = request.user?.id;

    if (userId === undefined) {
      throw new Error(
        'CurrentUserId usado numa rota sem autenticação. Remova o @Public() ou o decorator.',
      );
    }

    return userId;
  },
);
