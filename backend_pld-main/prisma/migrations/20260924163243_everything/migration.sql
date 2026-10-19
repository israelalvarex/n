-- DropForeignKey
ALTER TABLE "metric_resource_value" DROP CONSTRAINT "metric_resource_value_business_unit_id_fkey";

-- DropForeignKey
ALTER TABLE "metric_resource_value" DROP CONSTRAINT "metric_resource_value_department_id_fkey";

-- AddForeignKey
ALTER TABLE "metric_resource_value" ADD CONSTRAINT "metric_resource_value_business_unit_id_fkey" FOREIGN KEY ("business_unit_id") REFERENCES "business_unit"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "metric_resource_value" ADD CONSTRAINT "metric_resource_value_department_id_fkey" FOREIGN KEY ("department_id") REFERENCES "department"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
