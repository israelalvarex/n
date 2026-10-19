-- Comentarios en cualquier celda: el ancla de una cuenta que todavia no tiene
-- renglon es su nombre de cuenta y subcuenta, que no cabe en 64 caracteres.
ALTER TABLE "comment_thread" ALTER COLUMN "record_id" TYPE VARCHAR(255);

-- Lo presupuestado de las metricas de ingresos, por casino y mes.
CREATE TABLE "metric_budget_month" (
    "id" SERIAL NOT NULL,
    "fiscal_year_id" INTEGER NOT NULL,
    "business_unit_id" INTEGER NOT NULL,
    "metric" VARCHAR(150) NOT NULL,
    "month" "month" NOT NULL,
    "amount" DECIMAL(18,4) NOT NULL DEFAULT 0,
    "variant" VARCHAR(20),
    "is_override" BOOLEAN NOT NULL DEFAULT false,
    "override_reason" VARCHAR(255),
    "updated_by" INTEGER,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "metric_budget_month_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "metric_budget_month_fiscal_year_id_business_unit_id_metric_month_key" ON "metric_budget_month"("fiscal_year_id", "business_unit_id", "metric", "month");
CREATE INDEX "metric_budget_month_fiscal_year_id_metric_idx" ON "metric_budget_month"("fiscal_year_id", "metric");

ALTER TABLE "metric_budget_month" ADD CONSTRAINT "metric_budget_month_fiscal_year_id_fkey" FOREIGN KEY ("fiscal_year_id") REFERENCES "fiscal_year"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "metric_budget_month" ADD CONSTRAINT "metric_budget_month_business_unit_id_fkey" FOREIGN KEY ("business_unit_id") REFERENCES "business_unit"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Anclas de conversacion nuevas: una celda de la hoja de presupuesto que no es
-- un renglon guardado (una cuenta propuesta, un grupo, una columna) y una celda
-- de la hoja de una metrica de ingresos.
INSERT INTO "system_object" ("code", "name", "type", "module", "commentable")
VALUES
  ('budget_sheet_cell', 'Celda de la hoja de presupuesto', 'table', 'budget', true),
  ('metric_budget_month', 'Presupuesto de metricas de ingresos', 'table', 'metrics', true)
ON CONFLICT ("code") DO NOTHING;
