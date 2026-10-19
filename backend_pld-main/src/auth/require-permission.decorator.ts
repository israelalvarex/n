import { SetMetadata } from '@nestjs/common';

export const PERMISSION_KEY = 'requiredPermission';

/**
 * Permiso que exige una ruta, en claves de la tabla `permission`.
 * Ej: @RequirePermission('budget_line.capture')
 */
export const RequirePermission = (permission: string) => SetMetadata(PERMISSION_KEY, permission);
