-- AlterEnum: nuevas fuentes de valor para un renglon de presupuesto.
ALTER TYPE "line_source" ADD VALUE 'previous_year';
ALTER TYPE "line_source" ADD VALUE 'forecast';

-- AlterTable: mapeo manual (via la plataforma, no via Excel) de un concepto
-- del catalogo hacia su cuenta/subcuenta equivalente en metric_forecast/metric_training.
ALTER TABLE "line_item" ADD COLUMN "forecast_account" VARCHAR(80);
ALTER TABLE "line_item" ADD COLUMN "forecast_subaccount" VARCHAR(80);
