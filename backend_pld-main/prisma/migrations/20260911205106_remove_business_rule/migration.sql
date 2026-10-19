/*
  Warnings:

  - You are about to drop the `business_rule` table. If the table is not empty, all the data it contains will be lost.

*/
-- DropForeignKey
ALTER TABLE "business_rule" DROP CONSTRAINT "business_rule_business_unit_id_fkey";

-- DropForeignKey
ALTER TABLE "business_rule" DROP CONSTRAINT "business_rule_created_by_fkey";

-- DropForeignKey
ALTER TABLE "business_rule" DROP CONSTRAINT "business_rule_department_id_fkey";

-- DropForeignKey
ALTER TABLE "business_rule" DROP CONSTRAINT "business_rule_fiscal_year_id_fkey";

-- DropForeignKey
ALTER TABLE "business_rule" DROP CONSTRAINT "business_rule_system_object_id_fkey";

-- DropTable
DROP TABLE "business_rule";

-- DropEnum
DROP TYPE "rule_type";
