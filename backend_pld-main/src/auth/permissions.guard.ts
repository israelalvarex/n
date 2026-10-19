import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import { AuthorizationService } from './authorization.service';
import { PERMISSION_KEY } from './require-permission.decorator';

/**
 * Verifica el permiso declarado con @RequirePermission.
 * Corre DESPUES de SessionGuard, que es quien deja el perfil en la peticion.
 *
 * Esto resuelve "que puede hacer". El "que puede ver" (departamento x casino)
 * lo aplica cada servicio con scopeFilter: son dos preguntas distintas.
 */
@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(
    private reflector: Reflector,
    private authz: AuthorizationService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const required = this.reflector.getAllAndOverride<string>(PERMISSION_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!required) return true;

    const request = context.switchToHttp().getRequest<Request>();
    if (!request.user) throw new ForbiddenException('Sesion no resuelta');

    if (!(await this.authz.hasPermission(request.user.id, required))) {
      throw new ForbiddenException(`Te falta el permiso ${required}`);
    }
    return true;
  }
}
