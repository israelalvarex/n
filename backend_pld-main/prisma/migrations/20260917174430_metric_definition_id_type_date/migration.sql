/*
  Warnings:

  - The primary key for the `metric_definition` table will be changed. If it partially fails, the table could be left without primary key constraint.
  - You are about to drop the column `code` on the `metric_definition` table. All the data in the column will be lost.
  - Added the required column `date` to the `metric_definition` table without a default value. This is not possible if the table is not empty.
  - Added the required column `type` to the `metric_definition` table without a default value. This is not possible if the table is not empty.
  - Changed the type of `metric_code` on the `metric_forecast` table. No cast exists, the column would be dropped and recreated, which cannot be done if there is data, since the column is required.

*/
-- CreateEnum
CREATE TYPE "metric_definition_type" AS ENUM ('budgeted', 'forecasted', 'manual');

-- DropForeignKey
ALTER TABLE "metric_forecast" DROP CONSTRAINT "metric_forecast_metric_code_fkey";

-- AlterTable
ALTER TABLE "metric_definition" DROP CONSTRAINT "metric_definition_pkey",
DROP COLUMN "code",
ADD COLUMN     "date" DATE NOT NULL,
ADD COLUMN     "id" VARCHAR(36) NOT NULL DEFAULT gen_random_uuid(),
ADD COLUMN     "type" "metric_definition_type" NOT NULL,
ADD CONSTRAINT "metric_definition_pkey" PRIMARY KEY ("id");

-- AlterTable
ALTER TABLE "metric_forecast" DROP COLUMN "metric_code",
ADD COLUMN     "metric_code" VARCHAR(36) NOT NULL;

-- DropEnum
DROP TYPE "metric_code";

-- CreateIndex
CREATE UNIQUE INDEX "metric_forecast_metric_code_business_unit_id_date_generated_key" ON "metric_forecast"("metric_code", "business_unit_id", "date", "generated_at");

-- AddForeignKey
ALTER TABLE "metric_forecast" ADD CONSTRAINT "metric_forecast_metric_code_fkey" FOREIGN KEY ("metric_code") REFERENCES "metric_definition"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
