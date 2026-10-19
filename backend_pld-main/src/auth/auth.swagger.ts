// El campo "exports" del paquete no permite importar de dist/, y el barrel solo
// re-exporta OpenAPIObject. Estos dos tipos se derivan de el: son los mismos.
import type { OpenAPIObject } from '@nestjs/swagger';

type PathsObject = OpenAPIObject['paths'];
type ComponentsObject = NonNullable<OpenAPIObject['components']>;

export const authSchemas: ComponentsObject['schemas'] = {
  SignUpBody: {
    type: 'object',
    required: ['email', 'password', 'name'],
    properties: {
      email: { type: 'string', format: 'email', example: 'usuario@ejemplo.com' },
      password: { type: 'string', minLength: 8, example: 'miPassword123' },
      name: { type: 'string', example: 'José Antonio' },
    },
  },
  SignInBody: {
    type: 'object',
    required: ['email', 'password'],
    properties: {
      email: { type: 'string', format: 'email', example: 'usuario@ejemplo.com' },
      password: { type: 'string', example: 'miPassword123' },
    },
  },
  UserResponse: {
    type: 'object',
    properties: {
      id: { type: 'string', example: 'abc123xyz' },
      email: { type: 'string', example: 'usuario@ejemplo.com' },
      name: { type: 'string', example: 'José Antonio' },
      emailVerified: { type: 'boolean', example: false },
      createdAt: { type: 'string', format: 'date-time' },
      updatedAt: { type: 'string', format: 'date-time' },
    },
  },
  SessionResponse: {
    type: 'object',
    properties: {
      session: {
        type: 'object',
        properties: {
          id: { type: 'string', example: 'sess_abc123' },
          token: { type: 'string', example: 'tok_xyz789' },
          expiresAt: { type: 'string', format: 'date-time' },
          userId: { type: 'string', example: 'abc123xyz' },
        },
      },
      user: { $ref: '#/components/schemas/UserResponse' },
    },
  },
  CreateOrganizationBody: {
    type: 'object',
    required: ['name', 'slug'],
    properties: {
      name: { type: 'string', example: 'Mi Empresa' },
      slug: { type: 'string', example: 'mi-empresa' },
      logo: { type: 'string', example: 'https://mi-empresa.com/logo.png' },
    },
  },
  OrganizationResponse: {
    type: 'object',
    properties: {
      id: { type: 'string', example: 'org_abc123' },
      name: { type: 'string', example: 'Mi Empresa' },
      slug: { type: 'string', example: 'mi-empresa' },
      logo: { type: 'string', nullable: true },
      createdAt: { type: 'string', format: 'date-time' },
    },
  },
  InviteMemberBody: {
    type: 'object',
    required: ['email', 'organizationId', 'role'],
    properties: {
      email: { type: 'string', format: 'email', example: 'miembro@ejemplo.com' },
      organizationId: { type: 'string', example: 'org_abc123' },
      role: { type: 'string', enum: ['member', 'admin', 'owner'], example: 'member' },
    },
  },
  ErrorResponse: {
    type: 'object',
    properties: {
      message: { type: 'string', example: 'Invalid email or password' },
      code: { type: 'string', example: 'INVALID_CREDENTIALS' },
    },
  },
};

export const authPaths: PathsObject = {
  '/api/auth/sign-up/email': {
    post: {
      tags: ['Auth'],
      summary: 'Registrar nuevo usuario',
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: { $ref: '#/components/schemas/SignUpBody' },
          },
        },
      },
      responses: {
        201: {
          description: 'Usuario creado exitosamente',
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  token: { type: 'string', example: 'tok_xyz789' },
                  user: { $ref: '#/components/schemas/UserResponse' },
                },
              },
            },
          },
        },
        422: {
          description: 'El email ya está registrado o datos inválidos',
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/ErrorResponse' },
              example: { message: 'User already exists', code: 'USER_ALREADY_EXISTS' },
            },
          },
        },
      },
    },
  },
  '/api/auth/sign-in/email': {
    post: {
      tags: ['Auth'],
      summary: 'Iniciar sesión',
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: { $ref: '#/components/schemas/SignInBody' },
          },
        },
      },
      responses: {
        200: {
          description: 'Login exitoso — devuelve cookie de sesión',
          headers: {
            'Set-Cookie': {
              schema: { type: 'string' },
              description: 'Cookie de sesión (better-auth.session_token)',
            },
          },
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/SessionResponse' },
            },
          },
        },
        401: {
          description: 'Credenciales incorrectas',
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/ErrorResponse' },
              example: { message: 'Invalid email or password', code: 'INVALID_CREDENTIALS' },
            },
          },
        },
      },
    },
  },
  '/api/auth/sign-out': {
    post: {
      tags: ['Auth'],
      summary: 'Cerrar sesión',
      security: [{ cookieAuth: [] }],
      responses: {
        200: {
          description: 'Sesión cerrada exitosamente',
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  success: { type: 'boolean', example: true },
                },
              },
            },
          },
        },
        401: {
          description: 'Sin sesión activa',
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/ErrorResponse' },
              example: { message: 'Unauthorized' },
            },
          },
        },
      },
    },
  },
  '/api/auth/get-session': {
    get: {
      tags: ['Auth'],
      summary: 'Obtener sesión activa',
      security: [{ cookieAuth: [] }],
      responses: {
        200: {
          description: 'Sesión encontrada',
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/SessionResponse' },
            },
          },
        },
        401: {
          description: 'Sin sesión activa',
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/ErrorResponse' },
              example: { message: 'Unauthorized' },
            },
          },
        },
      },
    },
  },
  '/api/auth/organization/create': {
    post: {
      tags: ['Organizaciones'],
      summary: 'Crear organización',
      security: [{ cookieAuth: [] }],
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: { $ref: '#/components/schemas/CreateOrganizationBody' },
          },
        },
      },
      responses: {
        200: {
          description: 'Organización creada',
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/OrganizationResponse' },
            },
          },
        },
        400: {
          description: 'El slug ya existe',
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/ErrorResponse' },
              example: { message: 'Slug already exists' },
            },
          },
        },
        401: {
          description: 'No autenticado',
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/ErrorResponse' },
            },
          },
        },
      },
    },
  },
  '/api/auth/organization/invite-member': {
    post: {
      tags: ['Organizaciones'],
      summary: 'Invitar miembro a la organización',
      security: [{ cookieAuth: [] }],
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: { $ref: '#/components/schemas/InviteMemberBody' },
          },
        },
      },
      responses: {
        200: {
          description: 'Invitación enviada',
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  id: { type: 'string', example: 'inv_abc123' },
                  email: { type: 'string', example: 'miembro@ejemplo.com' },
                  role: { type: 'string', example: 'member' },
                  status: { type: 'string', example: 'pending' },
                  expiresAt: { type: 'string', format: 'date-time' },
                },
              },
            },
          },
        },
        403: {
          description: 'Sin permisos para invitar',
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/ErrorResponse' },
            },
          },
        },
      },
    },
  },
  '/api/auth/email-otp/send-verification-otp': {
    post: {
      tags: ['Auth'],
      summary: 'Enviar OTP por correo',
      description: 'Genera y envía un código OTP de 6 dígitos al email indicado. Expira en 10 minutos.',
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: {
              type: 'object',
              required: ['email', 'type'],
              properties: {
                email: { type: 'string', format: 'email', example: 'usuario@ejemplo.com' },
                type: {
                  type: 'string',
                  enum: ['sign-in', 'email-verification', 'forget-password'],
                  example: 'sign-in',
                },
              },
            },
          },
        },
      },
      responses: {
        200: { description: 'OTP enviado correctamente' },
        400: {
          description: 'Email inválido o tipo no soportado',
          content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } } },
        },
      },
    },
  },
  '/api/auth/two-factor/enable': {
    post: {
      tags: ['2FA'],
      summary: 'Habilitar 2FA (genera QR)',
      description: 'Genera un secreto TOTP y devuelve la URL del QR para escanear con Google Authenticator. Requiere sesión activa y la contraseña del usuario.',
      security: [{ cookieAuth: [] }],
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: {
              type: 'object',
              required: ['password'],
              properties: {
                password: { type: 'string', example: 'miPassword123' },
              },
            },
          },
        },
      },
      responses: {
        200: {
          description: 'QR generado — escanear con la app autenticadora',
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  totpURI: { type: 'string', example: 'otpauth://totp/SeanalyticsDashboard:usuario@ejemplo.com?secret=ABC123&issuer=SeanalyticsDashboard' },
                  backupCodes: { type: 'array', items: { type: 'string' }, example: ['abc123', 'def456'] },
                },
              },
            },
          },
        },
        401: { description: 'No autenticado o contraseña incorrecta' },
      },
    },
  },
  '/api/auth/two-factor/verify-totp': {
    post: {
      tags: ['2FA'],
      summary: 'Verificar código TOTP',
      description: 'Después del sign-in con password, si el usuario tiene 2FA activo, se debe verificar el código TOTP de 6 dígitos del autenticador para completar el login.',
      security: [{ cookieAuth: [] }],
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: {
              type: 'object',
              required: ['code'],
              properties: {
                code: { type: 'string', example: '123456' },
              },
            },
          },
        },
      },
      responses: {
        200: {
          description: 'Código válido — sesión completada',
          content: { 'application/json': { schema: { $ref: '#/components/schemas/SessionResponse' } } },
        },
        400: { description: 'Código inválido o expirado' },
      },
    },
  },
  '/api/auth/two-factor/disable': {
    post: {
      tags: ['2FA'],
      summary: 'Deshabilitar 2FA',
      description: 'Desactiva el 2FA del usuario. Requiere la contraseña para confirmar.',
      security: [{ cookieAuth: [] }],
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: {
              type: 'object',
              required: ['password'],
              properties: {
                password: { type: 'string', example: 'miPassword123' },
              },
            },
          },
        },
      },
      responses: {
        200: { description: '2FA deshabilitado correctamente' },
        401: { description: 'Contraseña incorrecta' },
      },
    },
  },
  '/api/auth/two-factor/generate-backup-codes': {
    post: {
      tags: ['2FA'],
      summary: 'Regenerar códigos de respaldo',
      description: 'Genera nuevos códigos de respaldo (backup codes) para usar si no tienes acceso al autenticador.',
      security: [{ cookieAuth: [] }],
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: {
              type: 'object',
              required: ['password'],
              properties: {
                password: { type: 'string', example: 'miPassword123' },
              },
            },
          },
        },
      },
      responses: {
        200: {
          description: 'Nuevos códigos generados',
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  backupCodes: { type: 'array', items: { type: 'string' }, example: ['abc123', 'def456'] },
                },
              },
            },
          },
        },
      },
    },
  },
  '/api/auth/two-factor/verify-backup-code': {
    post: {
      tags: ['2FA'],
      summary: 'Verificar código de respaldo',
      description: 'Usa un backup code para completar el login cuando no tienes acceso al autenticador.',
      security: [{ cookieAuth: [] }],
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: {
              type: 'object',
              required: ['code'],
              properties: {
                code: { type: 'string', example: 'abc123def' },
              },
            },
          },
        },
      },
      responses: {
        200: {
          description: 'Código válido — sesión completada',
          content: { 'application/json': { schema: { $ref: '#/components/schemas/SessionResponse' } } },
        },
        400: { description: 'Código de respaldo inválido o ya usado' },
      },
    },
  },
  '/api/auth/sign-in/email-otp': {
    post: {
      tags: ['Auth'],
      summary: 'Iniciar sesión con OTP',
      description: 'Verifica el OTP recibido por correo e inicia sesión. Devuelve cookie de sesión.',
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: {
              type: 'object',
              required: ['email', 'otp'],
              properties: {
                email: { type: 'string', format: 'email', example: 'usuario@ejemplo.com' },
                otp: { type: 'string', example: '123456' },
              },
            },
          },
        },
      },
      responses: {
        200: {
          description: 'Login exitoso — devuelve cookie de sesión',
          headers: {
            'Set-Cookie': {
              schema: { type: 'string' },
              description: 'Cookie de sesión (better-auth.session_token)',
            },
          },
          content: { 'application/json': { schema: { $ref: '#/components/schemas/SessionResponse' } } },
        },
        400: {
          description: 'OTP inválido o expirado',
          content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } } },
        },
      },
    },
  },
  '/api/auth/change-password': {
    post: {
      tags: ['Auth'],
      summary: 'Cambiar contraseña',
      description:
        'Requiere sesión activa (login previo) y el header Origin presente en CORS_ORIGIN/trustedOrigins — sin él responde MISSING_OR_NULL_ORIGIN. Sirve para reemplazar la contraseña temporal generada por POST /people/invite.',
      security: [{ cookieAuth: [] }],
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: {
              type: 'object',
              required: ['currentPassword', 'newPassword'],
              properties: {
                currentPassword: { type: 'string', example: 'miPassword123' },
                newPassword: { type: 'string', minLength: 8, example: 'miPasswordNuevo456' },
                revokeOtherSessions: { type: 'boolean', example: false, description: 'Cierra las demas sesiones activas del usuario' },
              },
            },
          },
        },
      },
      responses: {
        200: {
          description: 'Contraseña cambiada exitosamente',
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  token: { type: 'string', nullable: true, example: null },
                  user: { $ref: '#/components/schemas/UserResponse' },
                },
              },
            },
          },
        },
        401: {
          description: 'Sesión inválida/expirada o currentPassword incorrecto',
          content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } } },
        },
        400: {
          description: 'Falta el header Origin (debe estar en CORS_ORIGIN)',
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/ErrorResponse' },
              example: { message: 'Missing or null Origin', code: 'MISSING_OR_NULL_ORIGIN' },
            },
          },
        },
      },
    },
  },
};
