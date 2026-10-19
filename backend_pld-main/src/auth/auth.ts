import { betterAuth } from 'better-auth';
import { prismaAdapter } from 'better-auth/adapters/prisma';
import { admin, emailOTP, twoFactor } from 'better-auth/plugins';
import { PrismaClient } from '../../generated/prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Resend } from 'resend';
import * as dotenv from 'dotenv';

dotenv.config();

const resend = new Resend(process.env.RESEND_API_KEY);


const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! });
const prisma = new PrismaClient({ adapter });

export const auth = betterAuth({
  database: prismaAdapter(prisma, {
    provider: 'postgresql',
  }),

  // Better Auth usa por omision los modelos user/session/account/verification.
  // En este esquema "user" es el perfil de negocio (app_user), asi que hay que
  // apuntarlo a los modelos auth_*. Sin esto escribe encima de app_user.
  user: { modelName: 'authUser' },
  session: { modelName: 'authSession' },
  account: { modelName: 'authAccount' },
  verification: { modelName: 'authVerification' },

  appName: 'SeanalyticsDashboard',
  baseURL: process.env.BETTER_AUTH_URL,
  secret: process.env.BETTER_AUTH_SECRET,
  trustedOrigins: process.env.CORS_ORIGIN
    ? process.env.CORS_ORIGIN.split(',')
    : ['http://localhost:3000', 'http://localhost:5173'],
  emailAndPassword: {
    enabled: true,
    disableSignUp: true,

  },
  advanced: {
    useSecureCookies: process.env.NODE_ENV === 'production',
    defaultCookieAttributes: {
      secure: process.env.NODE_ENV === 'production',
      sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax',
      partitioned: process.env.NODE_ENV === 'production',
      httpOnly: true,
    },
  },
  // Ya no hace falta el hook que borraba `role`: existia porque Better Auth
  // escribia en app_user, donde 'role' choca. Ahora escribe en auth_user, que
  // tiene su propia columna 'role' (la del plugin admin: "user" / "admin").
  // Esa columna es de Better Auth y no tiene relacion con el modelo Role del
  // negocio; los permisos siguen saliendo de access_grant.
  plugins: [
    // organization() se quito a proposito: su modelo de roles es plano
    // (owner/admin/member) y duplicaria lo que ya resuelve access_grant con
    // departamento x casino. Mantener los dos garantiza que se desincronicen.
    admin(
      // {adminUserIds: ["tu-user-id-aqui"]}
    ),
    twoFactor({
      issuer: 'SeanalyticsDashboard',
      
    }),
    // Inicio de sesion con codigo por correo (el login de los frontends).
    //
    // - Nunca crea cuentas (disableSignUp): las credenciales nacen al invitar
    //   a la persona (POST /people/invite).
    // - El codigo solo se manda a correos activos en el directorio (app_user).
    //   A cualquier otro no se le manda nada, y el endpoint contesta igual,
    //   asi que no revela quien tiene cuenta.
    // - El codigo nunca se escribe en los logs.
    emailOTP({
      expiresIn: 600,
      otpLength: 6,
      allowedAttempts: 5,
      disableSignUp: true,
      async sendVerificationOTP({ email, otp, type }) {
        if (type === 'sign-in') {
          const persona = await prisma.user.findFirst({
            where: { email: { equals: email, mode: 'insensitive' }, active: true },
            select: { id: true },
          });
          if (!persona) {
            console.log('[OTP] inicio de sesion pedido para un correo fuera del directorio; no se envia');
            return;
          }
        }

        const asuntos: Record<string, string> = {
          'sign-in': 'Tu código para entrar a CECOM',
          'email-verification': 'Verifica tu correo — CECOM',
          'forget-password': 'Restablece tu contraseña — CECOM',
        };
        const motivos: Record<string, string> = {
          'sign-in': 'Usa este código para entrar a Presupuestos CECOM.',
          'email-verification': 'Verifica tu dirección de correo.',
          'forget-password': 'Solicitud de restablecimiento de contraseña.',
        };
        const from = process.env.RESEND_FROM_EMAIL ?? 'onboarding@resend.dev';
        const result = await resend.emails.send({
          from,
          to: email,
          subject: asuntos[type] ?? 'Tu código de acceso — CECOM',
          html: `
            <div style="font-family:sans-serif;max-width:480px;margin:0 auto;padding:32px 24px">
              <h2 style="margin:0 0 8px;font-size:20px;color:#111">Tu código de acceso</h2>
              <p style="margin:0 0 24px;color:#555;font-size:14px">
                ${motivos[type] ?? ''} Expira en <strong>10 minutos</strong>.
              </p>
              <div style="background:#f4f4f5;border-radius:12px;padding:24px;text-align:center">
                <span style="font-size:36px;font-weight:700;letter-spacing:8px;color:#111">${otp}</span>
              </div>
              <p style="margin:24px 0 0;color:#888;font-size:12px">
                Si no realizaste esta solicitud, ignora este correo.
              </p>
            </div>
          `,
        });
        if (result.error) {
          console.error('[OTP] Resend no pudo enviar el correo:', { type, error: result.error });
        }
      },
    }),
  ],
});
