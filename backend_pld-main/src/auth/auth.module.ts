import { Global, Module } from '@nestjs/common';
import { AuthorizationService } from './authorization.service';
import { PermissionsGuard } from './permissions.guard';
import { SessionGuard } from './session.guard';

/**
 * Autorizacion: quien alcanza que.
 * La autenticacion la resuelve Better Auth, montado como handler en main.ts.
 */
@Global()
@Module({
  providers: [AuthorizationService, SessionGuard, PermissionsGuard],
  exports: [AuthorizationService, SessionGuard, PermissionsGuard],
})
export class AuthModule {}
