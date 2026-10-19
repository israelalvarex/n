-- "Como se usa" el recurso -- texto libre, se llena a futuro.
ALTER TABLE "metric_resource" ADD COLUMN "how_applied" VARCHAR(255);

-- Un MetricResourceValue puede ser global (NULL/NULL) o especifico de un
-- casino/departamento -- permite que el mismo recurso (ej. DAU) tenga un
-- valor distinto por casino sin duplicar el MetricResource.
ALTER TABLE "metric_resource_value" ADD COLUMN "business_unit_id" INTEGER;
ALTER TABLE "metric_resource_value" ADD COLUMN "department_id" INTEGER;

ALTER TABLE "metric_resource_value"
  ADD CONSTRAINT "metric_resource_value_business_unit_id_fkey"
  FOREIGN KEY ("business_unit_id") REFERENCES "business_unit"("id") ON DELETE RESTRICT;

ALTER TABLE "metric_resource_value"
  ADD CONSTRAINT "metric_resource_value_department_id_fkey"
  FOREIGN KEY ("department_id") REFERENCES "department"("id") ON DELETE RESTRICT;

-- Las filas ya existentes se quedan NULL/NULL (globales) -- comportamiento
-- identico al de antes, no hay backfill que hacer. Es un INDEX unico, no un
-- constraint (asi lo creo la migracion original), por eso DROP INDEX.
DROP INDEX "metric_resource_value_metric_id_fiscal_year_id_key";

-- NULLS NOT DISTINCT (PG15+): dos filas globales (NULL/NULL) para el mismo
-- metric+anio SI cuentan como duplicado -- sin esto, Postgres trataria cada
-- NULL como distinto y dejaria crear dos "valores globales" a la vez.
ALTER TABLE "metric_resource_value"
  ADD CONSTRAINT "metric_resource_value_metric_id_fiscal_year_id_business_uni_key"
  UNIQUE NULLS NOT DISTINCT ("metric_id", "fiscal_year_id", "business_unit_id", "department_id");
