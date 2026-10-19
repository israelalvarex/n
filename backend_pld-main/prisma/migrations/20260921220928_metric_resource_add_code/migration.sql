-- AlterTable: agregar "code" (nullable primero, para poder rellenar filas existentes)
ALTER TABLE "metric_resource" ADD COLUMN "code" VARCHAR(60);

-- Backfill: las filas existentes ya tienen nombres cortos válidos como código
UPDATE "metric_resource" SET "code" = "name" WHERE "code" IS NULL;

-- Ahora sí, obligatorio y único
ALTER TABLE "metric_resource" ALTER COLUMN "code" SET NOT NULL;
ALTER TABLE "metric_resource" ADD CONSTRAINT "metric_resource_code_key" UNIQUE ("code");

-- "name" deja de ser único -- ya es solo etiqueta de display, no identificador
ALTER TABLE "metric_resource" DROP CONSTRAINT "metric_resource_name_key";
