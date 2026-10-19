import { CanActivate, ExecutionContext, ForbiddenException, Injectable, UnauthorizedException } from '@nestjs/common';
import { fromNodeHeaders } from 'better-auth/node';
import type { Request } from 'express';
import { auth } from './auth';
import { PrismaService } from '../prisma/prisma.service';

/** Perfil de negocio del solicitante, resuelto desde la sesion. */
export interface RequestUser {
  id: number;
  name: string;
  email: string;
  isSuperadmin: boolean;
  departmentId: number | null;
}

declare module 'express' {
  interface Request {
    user?: RequestUser;
  }
}

/**
 * Traduce la sesion de Better Auth al usuario de negocio.
 *
 * Better Auth responde QUIEN ERES (auth_user); este guard busca su perfil en
 * app_user, que es lo que el resto del sistema usa para todo. Son tablas
 * distintas a proposito: ver la seccion 18 del DBML.
 */
/** Cada cuanto se actualiza `lastLogin` de un usuario que sigue trabajando. */
const ULTIMO_ACCESO_MS = 15 * 60 * 1000;

@Injectable()
export class SessionGuard implements CanActivate {
  constructor(private prisma: PrismaService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<Request>();

    const session = await auth.api.getSession({
      headers: fromNodeHeaders(request.headers),
    });
    if (!session?.user) {
      throw new UnauthorizedException('Sesion no valida o expirada');
    }

    request.user = await this.resolveProfile(session.user.id, session.user.email);
    return true;
  }

  /**
   * Busca el perfil por su enlace con Better Auth. Si no existe, lo busca por
   * correo y lo enlaza: es el momento en que una persona invitada activa su
   * cuenta y su fila del directorio se une con su identidad de acceso.
   *
   * Quien no este en el directorio no entra, aunque tenga credenciales validas.
   */
  private async resolveProfile(authUserId: string, email: string): Promise<RequestUser> {
    const select = { id: true, name: true, email: true, isSuperadmin: true, departmentId: true, active: true, lastLogin: true };

    let profile = await this.prisma.user.findUnique({ where: { authUserId }, select });

    if (!profile) {
      const invited = await this.prisma.user.findUnique({ where: { email }, select: { id: true, authUserId: true } });
      if (!invited) {
        throw new ForbiddenException('Tu cuenta no esta dada de alta en el directorio');
      }
      if (invited.authUserId && invited.authUserId !== authUserId) {
        throw new ForbiddenException('Ese correo ya esta enlazado a otra identidad');
      }
      profile = await this.prisma.user.update({ where: { id: invited.id }, data: { authUserId }, select });
    }

    if (!profile.active) {
      throw new ForbiddenException('Tu cuenta esta desactivada');
    }

    // El ultimo acceso no necesita precision de segundos: escribirlo en cada
    // peticion le sumaba una escritura a todas. Basta con refrescarlo cada tanto.
    const ahora = new Date();
    if (!profile.lastLogin || ahora.getTime() - profile.lastLogin.getTime() > ULTIMO_ACCESO_MS) {
      await this.prisma.user.update({ where: { id: profile.id }, data: { lastLogin: ahora } });
    }

    const { active: _active, lastLogin: _lastLogin, ...user } = profile;
    return user;
  }
}
