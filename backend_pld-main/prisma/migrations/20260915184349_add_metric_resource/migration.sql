-- CreateEnum
CREATE TYPE "metric_type" AS ENUM ('base', 'nested');

-- CreateTable
CREATE TABLE "metric_resource" (
    "id" VARCHAR(36) NOT NULL DEFAULT gen_random_uuid(),
    "name" VARCHAR(180) NOT NULL,
    "type" "metric_type" NOT NULL,
    "scope" JSONB NOT NULL,
    "expression" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" INTEGER NOT NULL,
    "business_unit_id" INTEGER NOT NULL,

    CONSTRAINT "metric_resource_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "metric_resource_value" (
    "id" VARCHAR(36) NOT NULL DEFAULT gen_random_uuid(),
    "metric_id" VARCHAR(36) NOT NULL,
    "fiscal_year_id" INTEGER NOT NULL,
    "value" DECIMAL(18,6) NOT NULL,
    "is_projection" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" INTEGER NOT NULL,

    CONSTRAINT "metric_resource_value_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "metric_dependency" (
    "metric_id" VARCHAR(36) NOT NULL,
    "depends_on_metric_id" VARCHAR(36) NOT NULL,

    CONSTRAINT "metric_dependency_pkey" PRIMARY KEY ("metric_id","depends_on_metric_id")
);

-- CreateTable
CREATE TABLE "metric_resource_snapshot" (
    "id" VARCHAR(36) NOT NULL DEFAULT gen_random_uuid(),
    "final_budget_id" INTEGER NOT NULL,
    "metric_values" JSONB NOT NULL,
    "specified_date" DATE NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" INTEGER NOT NULL,

    CONSTRAINT "metric_resource_snapshot_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "metric_resource_value_metric_id_fiscal_year_id_key" ON "metric_resource_value"("metric_id", "fiscal_year_id");

-- AddForeignKey
ALTER TABLE "metric_resource" ADD CONSTRAINT "metric_resource_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "app_user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "metric_resource" ADD CONSTRAINT "metric_resource_business_unit_id_fkey" FOREIGN KEY ("business_unit_id") REFERENCES "business_unit"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "metric_resource_value" ADD CONSTRAINT "metric_resource_value_metric_id_fkey" FOREIGN KEY ("metric_id") REFERENCES "metric_resource"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "metric_resource_value" ADD CONSTRAINT "metric_resource_value_fiscal_year_id_fkey" FOREIGN KEY ("fiscal_year_id") REFERENCES "fiscal_year"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "metric_resource_value" ADD CONSTRAINT "metric_resource_value_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "app_user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "metric_dependency" ADD CONSTRAINT "metric_dependency_metric_id_fkey" FOREIGN KEY ("metric_id") REFERENCES "metric_resource"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "metric_dependency" ADD CONSTRAINT "metric_dependency_depends_on_metric_id_fkey" FOREIGN KEY ("depends_on_metric_id") REFERENCES "metric_resource"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "metric_resource_snapshot" ADD CONSTRAINT "metric_resource_snapshot_final_budget_id_fkey" FOREIGN KEY ("final_budget_id") REFERENCES "budget"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "metric_resource_snapshot" ADD CONSTRAINT "metric_resource_snapshot_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "app_user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
