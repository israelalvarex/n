/*
  Warnings:

  - Added the required column `account` to the `metric_forecast` table without a default value. This is not possible if the table is not empty.
  - Added the required column `department` to the `metric_forecast` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "metric_forecast" ADD COLUMN     "account" VARCHAR(20) NOT NULL,
ADD COLUMN     "department" VARCHAR(40) NOT NULL,
ADD COLUMN     "subaccount" VARCHAR(20);

-- AddForeignKey
ALTER TABLE "metric_forecast" ADD CONSTRAINT "metric_forecast_department_fkey" FOREIGN KEY ("department") REFERENCES "department"("code") ON DELETE RESTRICT ON UPDATE CASCADE;
