import {
  CanActivate,
  ExecutionContext,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { Request } from 'express';
import { envConfig } from '../../config/env.config';

/**
 * Protege endpoints con una API key en el header `x-api-key`.
 *
 * Si API_KEY no está configurada el guard niega todo: un backend sin llave
 * definida es un backend abierto, y fallar cerrado es lo correcto.
 */
@Injectable()
export class ApiKeyGuard implements CanActivate {
  private readonly logger = new Logger(ApiKeyGuard.name);

  canActivate(context: ExecutionContext): boolean {
    const esperada = envConfig.api_key;
    if (!esperada) {
      this.logger.error(
        'API_KEY no está configurada; se rechazan todas las peticiones a rutas protegidas.',
      );
      throw new UnauthorizedException('API Key inválida.');
    }

    const request = context.switchToHttp().getRequest<Request>();
    const recibida = request.header('x-api-key');
    if (!recibida || !comparaEnTiempoConstante(recibida, esperada)) {
      throw new UnauthorizedException('API Key inválida.');
    }

    return true;
  }
}

/** Compara sin filtrar por tiempo cuántos caracteres del prefijo coinciden. */
function comparaEnTiempoConstante(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diferencia = 0;
  for (let i = 0; i < a.length; i++) {
    diferencia |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diferencia === 0;
}
