/*
  Warnings:

  - The `department` column on the `metric_forecast` table would be dropped and recreated. This will lead to data loss if there is data in the column.

*/
-- DropForeignKey
ALTER TABLE "metric_forecast" DROP CONSTRAINT "metric_forecast_department_fkey";

-- AlterTable
ALTER TABLE "metric_forecast" DROP COLUMN "department",
ADD COLUMN     "department" INTEGER;

-- AddForeignKey
ALTER TABLE "metric_forecast" ADD CONSTRAINT "metric_forecast_department_fkey" FOREIGN KEY ("department") REFERENCES "department"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
