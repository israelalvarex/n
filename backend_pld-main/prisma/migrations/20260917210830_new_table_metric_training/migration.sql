-- CreateTable
CREATE TABLE "metric_training" (
    "id" VARCHAR(36) NOT NULL DEFAULT gen_random_uuid(),
    "metric_code" VARCHAR(36) NOT NULL,
    "business_unit_id" INTEGER NOT NULL,
    "date" DATE NOT NULL,
    "value" DECIMAL(18,6) NOT NULL,
    "department" INTEGER,
    "account" VARCHAR(80),
    "subaccount" VARCHAR(80),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "metric_training_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "metric_training_business_unit_id_date_idx" ON "metric_training"("business_unit_id", "date");

-- AddForeignKey
ALTER TABLE "metric_training" ADD CONSTRAINT "metric_training_metric_code_fkey" FOREIGN KEY ("metric_code") REFERENCES "metric_definition"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "metric_training" ADD CONSTRAINT "metric_training_business_unit_id_fkey" FOREIGN KEY ("business_unit_id") REFERENCES "business_unit"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "metric_training" ADD CONSTRAINT "metric_training_department_fkey" FOREIGN KEY ("department") REFERENCES "department"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
