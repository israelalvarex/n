-- Baseline: documenta cambios ya aplicados a la base de datos con `prisma db push`
-- (nunca se generó migración para ellos). No se ejecuta este SQL: la migración
-- se marca como aplicada con `prisma migrate resolve --applied`, ya que la
-- estructura ya existe en la base de datos.

-- Plugin admin de Better Auth (rol, baneo)
ALTER TABLE "auth_user"
  ADD COLUMN "ban_expires" TIMESTAMPTZ(6),
  ADD COLUMN "ban_reason" TEXT,
  ADD COLUMN "banned" BOOLEAN DEFAULT false,
  ADD COLUMN "role" VARCHAR(40),
  ADD COLUMN "two_factor_enabled" BOOLEAN DEFAULT false;

-- Plugin admin: suplantación de sesión
ALTER TABLE "auth_session" ADD COLUMN "impersonated_by" VARCHAR(64);

-- Plugin twoFactor de Better Auth
CREATE TABLE "two_factor" (
    "id" TEXT NOT NULL,
    "user_id" VARCHAR(64) NOT NULL,
    "secret" TEXT NOT NULL,
    "backup_codes" TEXT NOT NULL,
    "verified" BOOLEAN DEFAULT true,
    "failed_verification_count" INTEGER DEFAULT 0,

    CONSTRAINT "two_factor_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "two_factor_user_id_idx" ON "two_factor"("user_id");

ALTER TABLE "two_factor" ADD CONSTRAINT "two_factor_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth_user"("id") ON DELETE CASCADE ON UPDATE CASCADE;
