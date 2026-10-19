import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import type { Request } from 'express';
import type { RequestUser } from './session.guard';

/** Perfil de negocio del solicitante. Requiere SessionGuard. */
export const CurrentUser = createParamDecorator(
  (_data: unknown, context: ExecutionContext): RequestUser => {
    const request = context.switchToHttp().getRequest<Request>();
    if (!request.user) {
      throw new Error('CurrentUser sin SessionGuard: la ruta no resolvio la sesion');
    }
    return request.user;
  },
);
