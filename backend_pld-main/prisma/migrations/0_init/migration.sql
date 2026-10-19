-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "month" AS ENUM ('jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec');

-- CreateEnum
CREATE TYPE "line_nature" AS ENUM ('revenue', 'expense', 'rawMaterialCost', 'payroll', 'tax', 'asset', 'depreciation', 'indicator');

-- CreateEnum
CREATE TYPE "scenario" AS ENUM ('base', 'target', 'aggressive');

-- CreateEnum
CREATE TYPE "budget_status" AS ENUM ('draft', 'inReview', 'approved', 'closed', 'reforecast');

-- CreateEnum
CREATE TYPE "frequency" AS ENUM ('monthly', 'daily', 'perHeadcount', 'perEvent', 'variable', 'yearly', 'bimonthly', 'quarterly', 'biannual', 'seasonal');

-- CreateEnum
CREATE TYPE "resource_type" AS ENUM ('parameter', 'supply', 'payScale', 'rate');

-- CreateEnum
CREATE TYPE "quantity_source" AS ENUM ('fixed', 'derivedFromDau');

-- CreateEnum
CREATE TYPE "line_source" AS ENUM ('resource', 'formula', 'parameter', 'manual');

-- CreateEnum
CREATE TYPE "revenue_stream" AS ENUM ('slots', 'tables', 'sportsbook', 'fnbThirdParty', 'loyaltyClub', 'casinoComps', 'events', 'other');

-- CreateEnum
CREATE TYPE "license_type" AS ENUM ('external', 'internal');

-- CreateEnum
CREATE TYPE "machine_ownership" AS ENUM ('ownedCdm', 'ownedFmx', 'leasedFromVendor');

-- CreateEnum
CREATE TYPE "supply_block_type" AS ENUM ('thirdPartySales', 'aggressivePromos', 'foodComps', 'employeeComps');

-- CreateEnum
CREATE TYPE "supply_history_type" AS ENUM ('packsSold', 'cigarettePurchase', 'bagInBoxPurchase');

-- CreateEnum
CREATE TYPE "card_type" AS ENUM ('debit', 'credit', 'average');

-- CreateEnum
CREATE TYPE "tax_line" AS ENUM ('slots', 'sportsbook', 'tables', 'fnb');

-- CreateEnum
CREATE TYPE "thread_status" AS ENUM ('open', 'resolved');

-- CreateEnum
CREATE TYPE "attachment_status" AS ENUM ('pending', 'available', 'deleted');

-- CreateEnum
CREATE TYPE "capture_status" AS ENUM ('notStarted', 'inProgress', 'complete', 'submitted', 'approved', 'rejected');

-- CreateEnum
CREATE TYPE "review_outcome" AS ENUM ('approvedAndFrozen', 'changesRequested', 'rejected');

-- CreateEnum
CREATE TYPE "scope_mode" AS ENUM ('all', 'selected');

-- CreateEnum
CREATE TYPE "access_result" AS ENUM ('allowed', 'deniedDepartment', 'deniedBusinessUnit', 'deniedPermission');

-- CreateEnum
CREATE TYPE "action" AS ENUM ('read', 'create', 'update', 'delete', 'capture', 'approve', 'reopen', 'export', 'manage');

-- CreateEnum
CREATE TYPE "system_object_type" AS ENUM ('table', 'view', 'report', 'module', 'operation');

-- CreateEnum
CREATE TYPE "permission_effect" AS ENUM ('allow', 'deny');

-- CreateEnum
CREATE TYPE "rule_type" AS ENUM ('validation', 'visibility', 'calculation', 'workflow', 'alert');

-- CreateEnum
CREATE TYPE "setting_scope" AS ENUM ('global', 'fiscalYear', 'businessUnit', 'department', 'costCenter', 'user');

-- CreateEnum
CREATE TYPE "metric_unit" AS ENUM ('count', 'currency', 'percentage', 'ratio', 'duration');

-- CreateEnum
CREATE TYPE "metric_granularity" AS ENUM ('daily', 'weekly', 'monthly', 'quarterly', 'yearly');

-- CreateEnum
CREATE TYPE "metric_code" AS ENUM ('DAU', 'MAU', 'ARPU');

-- CreateTable
CREATE TABLE "company" (
    "id" SERIAL NOT NULL,
    "code" VARCHAR(20) NOT NULL,
    "legal_name" VARCHAR(255) NOT NULL,
    "tax_id" VARCHAR(13),
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "company_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "business_unit" (
    "id" SERIAL NOT NULL,
    "company_id" INTEGER NOT NULL,
    "code" VARCHAR(20) NOT NULL,
    "name" VARCHAR(150) NOT NULL,
    "type" VARCHAR(30) NOT NULL,
    "city" VARCHAR(100),
    "active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "business_unit_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cost_center" (
    "id" SERIAL NOT NULL,
    "business_unit_id" INTEGER NOT NULL,
    "code" VARCHAR(20) NOT NULL,
    "name" VARCHAR(150) NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "cost_center_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "app_user" (
    "id" SERIAL NOT NULL,
    "auth_user_id" VARCHAR(64),
    "department_id" INTEGER,
    "name" VARCHAR(150) NOT NULL,
    "job_title" VARCHAR(150),
    "email" VARCHAR(180) NOT NULL,
    "is_superadmin" BOOLEAN NOT NULL DEFAULT false,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "last_login" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "app_user_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "department" (
    "id" SERIAL NOT NULL,
    "code" VARCHAR(40) NOT NULL,
    "name" VARCHAR(150) NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "department_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "fiscal_year" (
    "id" SERIAL NOT NULL,
    "year" INTEGER NOT NULL,
    "reference_year" INTEGER NOT NULL,
    "is_open" BOOLEAN NOT NULL DEFAULT true,
    "opened_on" DATE,
    "closes_on" DATE,
    "closed_at" TIMESTAMPTZ(6),
    "closed_by" INTEGER,

    CONSTRAINT "fiscal_year_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "month_calendar" (
    "id" SERIAL NOT NULL,
    "fiscal_year_id" INTEGER NOT NULL,
    "month" "month" NOT NULL,
    "month_number" SMALLINT NOT NULL,
    "days" SMALLINT NOT NULL,
    "holidays" SMALLINT NOT NULL DEFAULT 0,
    "payment_days" SMALLINT,

    CONSTRAINT "month_calendar_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "budget_sheet" (
    "id" SERIAL NOT NULL,
    "department_id" INTEGER,
    "code" VARCHAR(40) NOT NULL,
    "name" VARCHAR(150) NOT NULL,
    "nature" "line_nature" NOT NULL,
    "sort_order" SMALLINT NOT NULL,
    "applies_to_casino" BOOLEAN NOT NULL DEFAULT true,
    "applies_to_restaurant" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "budget_sheet_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "budget_sheet_note" (
    "id" SERIAL NOT NULL,
    "budget_sheet_id" INTEGER NOT NULL,
    "type" VARCHAR(20) NOT NULL,
    "sort_order" SMALLINT NOT NULL,
    "text" TEXT NOT NULL,

    CONSTRAINT "budget_sheet_note_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "category" (
    "id" SERIAL NOT NULL,
    "budget_sheet_id" INTEGER NOT NULL,
    "parent_category_id" INTEGER,
    "department_id" INTEGER,
    "owner_user_id" INTEGER,
    "code" VARCHAR(60) NOT NULL,
    "name" VARCHAR(180) NOT NULL,
    "sort_order" SMALLINT NOT NULL,
    "is_subtotal" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "category_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "line_item" (
    "id" SERIAL NOT NULL,
    "category_id" INTEGER NOT NULL,
    "code" VARCHAR(80) NOT NULL,
    "name" VARCHAR(255) NOT NULL,
    "nature" "line_nature" NOT NULL,
    "frequency" "frequency" NOT NULL DEFAULT 'monthly',
    "applicable_months" SMALLINT[],
    "gl_account" VARCHAR(30),
    "fnb_only" BOOLEAN NOT NULL DEFAULT false,
    "cost_center_only" VARCHAR(20),
    "editable" BOOLEAN NOT NULL DEFAULT true,
    "sort_order" SMALLINT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "line_item_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "gl_account" (
    "id" SERIAL NOT NULL,
    "code" VARCHAR(20) NOT NULL,
    "name" VARCHAR(180) NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "gl_account_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "resource" (
    "id" SERIAL NOT NULL,
    "department_id" INTEGER NOT NULL,
    "gl_account_id" INTEGER,
    "type" "resource_type" NOT NULL,
    "code" VARCHAR(60) NOT NULL,
    "name" VARCHAR(180) NOT NULL,
    "unit" VARCHAR(20),
    "description" VARCHAR(255),
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "resource_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "resource_value" (
    "id" SERIAL NOT NULL,
    "resource_id" INTEGER NOT NULL,
    "year" INTEGER NOT NULL,
    "component" VARCHAR(60) NOT NULL DEFAULT 'valor',
    "value" DECIMAL(18,6) NOT NULL,
    "is_projection" BOOLEAN NOT NULL DEFAULT false,
    "confirmed_at" TIMESTAMPTZ(6),
    "confirmed_by" INTEGER,

    CONSTRAINT "resource_value_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "resource_quantity" (
    "id" SERIAL NOT NULL,
    "resource_id" INTEGER NOT NULL,
    "business_unit_id" INTEGER NOT NULL,
    "fiscal_year_id" INTEGER NOT NULL,
    "quantity_source" "quantity_source" NOT NULL DEFAULT 'fixed',
    "quantity" DECIMAL(18,6),
    "base" VARCHAR(20) NOT NULL DEFAULT 'dia',

    CONSTRAINT "resource_quantity_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "monthly_demand" (
    "id" SERIAL NOT NULL,
    "business_unit_id" INTEGER NOT NULL,
    "fiscal_year_id" INTEGER NOT NULL,
    "month" "month" NOT NULL,
    "dau" DECIMAL(14,4) NOT NULL,
    "guests_served" DECIMAL(14,4),
    "is_estimated" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "monthly_demand_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "resource_factor" (
    "id" SERIAL NOT NULL,
    "resource_id" INTEGER NOT NULL,
    "business_unit_id" INTEGER,
    "fiscal_year_id" INTEGER NOT NULL,
    "code" VARCHAR(60) NOT NULL,
    "value" DECIMAL(18,6) NOT NULL,
    "unit" VARCHAR(20),
    "source" VARCHAR(120),

    CONSTRAINT "resource_factor_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "resource_recalculation" (
    "id" BIGSERIAL NOT NULL,
    "resource_id" INTEGER NOT NULL,
    "fiscal_year_id" INTEGER NOT NULL,
    "triggered_by" INTEGER,
    "reason" VARCHAR(60) NOT NULL,
    "affected_lines" INTEGER NOT NULL DEFAULT 0,
    "notified_count" INTEGER NOT NULL DEFAULT 0,
    "executed_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "resource_recalculation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "budget" (
    "id" SERIAL NOT NULL,
    "fiscal_year_id" INTEGER NOT NULL,
    "business_unit_id" INTEGER NOT NULL,
    "cost_center_id" INTEGER NOT NULL,
    "scenario" "scenario" NOT NULL DEFAULT 'base',
    "version" SMALLINT NOT NULL DEFAULT 1,
    "status" "budget_status" NOT NULL DEFAULT 'draft',
    "is_current" BOOLEAN NOT NULL DEFAULT true,
    "approved_by" INTEGER,
    "approved_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "budget_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "budget_line" (
    "id" SERIAL NOT NULL,
    "budget_id" INTEGER NOT NULL,
    "line_item_id" INTEGER NOT NULL,
    "department_id" INTEGER NOT NULL,
    "gl_account_id" INTEGER,
    "source" "line_source" NOT NULL DEFAULT 'resource',
    "resource_id" INTEGER,
    "component" VARCHAR(60),
    "quantity" DECIMAL(18,6),
    "quantity_unit" VARCHAR(30),
    "calculation_note" VARCHAR(255),
    "frequency" "frequency",
    "reference_amount" DECIMAL(18,4),
    "factor" DECIMAL(9,6),
    "factor_text" VARCHAR(40),
    "total_annual" DECIMAL(18,4) NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "budget_line_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "budget_line_month" (
    "id" SERIAL NOT NULL,
    "line_id" INTEGER NOT NULL,
    "month" "month" NOT NULL,
    "amount" DECIMAL(18,4) NOT NULL DEFAULT 0,
    "calculated_amount" DECIMAL(18,4),
    "is_override" BOOLEAN NOT NULL DEFAULT false,
    "override_reason" VARCHAR(255),
    "calculated_at" TIMESTAMPTZ(6),

    CONSTRAINT "budget_line_month_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "budget_line_link" (
    "id" SERIAL NOT NULL,
    "target_line_id" INTEGER NOT NULL,
    "source_line_id" INTEGER NOT NULL,
    "ratio" DECIMAL(9,6) NOT NULL DEFAULT 1,
    "description" VARCHAR(255),

    CONSTRAINT "budget_line_link_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "monthly_revenue" (
    "id" SERIAL NOT NULL,
    "budget_id" INTEGER NOT NULL,
    "revenue_stream" "revenue_stream" NOT NULL,
    "month" "month" NOT NULL,
    "amount" DECIMAL(18,4) NOT NULL DEFAULT 0,
    "gaming_revenue_pct" DECIMAL(9,6),

    CONSTRAINT "monthly_revenue_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payroll_benefit" (
    "id" SERIAL NOT NULL,
    "budget_id" INTEGER NOT NULL,
    "name" VARCHAR(120) NOT NULL,
    "beneficiaries" INTEGER NOT NULL DEFAULT 0,
    "unit_amount" DECIMAL(14,4) NOT NULL DEFAULT 0,
    "included_in_payroll" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "payroll_benefit_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "team_event" (
    "id" SERIAL NOT NULL,
    "budget_id" INTEGER NOT NULL,
    "line_item_id" INTEGER,
    "name" VARCHAR(180) NOT NULL,
    "month" "month" NOT NULL,
    "guests" INTEGER,
    "budget_per_guest" DECIMAL(14,4),
    "flat_budget" DECIMAL(14,4),
    "factor" DECIMAL(9,6) DEFAULT 0.05,

    CONSTRAINT "team_event_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "budgeted_trip" (
    "id" SERIAL NOT NULL,
    "budget_id" INTEGER NOT NULL,
    "destination" VARCHAR(120) NOT NULL,
    "month" "month" NOT NULL,
    "guests" INTEGER NOT NULL DEFAULT 0,
    "unit_cost" DECIMAL(14,4) NOT NULL,
    "factor" DECIMAL(9,6) DEFAULT 0.05,

    CONSTRAINT "budgeted_trip_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "license" (
    "id" SERIAL NOT NULL,
    "code" VARCHAR(60) NOT NULL,
    "name" VARCHAR(150) NOT NULL,
    "vendor" VARCHAR(150),
    "area" VARCHAR(80),
    "type" "license_type" NOT NULL,
    "currency" CHAR(3) NOT NULL DEFAULT 'MXN',
    "daily_unit_cost" DECIMAL(14,6),
    "active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "license_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "license_line" (
    "id" SERIAL NOT NULL,
    "budget_id" INTEGER NOT NULL,
    "license_id" INTEGER NOT NULL,
    "units" INTEGER,
    "reference_cost" DECIMAL(18,4),
    "factor" DECIMAL(9,6) DEFAULT 0.05,
    "exchange_rate" DECIMAL(10,4),

    CONSTRAINT "license_line_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "machine_royalty" (
    "id" SERIAL NOT NULL,
    "budget_id" INTEGER NOT NULL,
    "ownership" "machine_ownership" NOT NULL,
    "machine_count" INTEGER NOT NULL DEFAULT 0,
    "daily_revenue_per_machine" DECIMAL(14,4),
    "avg_netwin_pct" DECIMAL(9,6),
    "royalty_cost_pct" DECIMAL(9,6),

    CONSTRAINT "machine_royalty_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "table_royalty" (
    "id" SERIAL NOT NULL,
    "budget_id" INTEGER NOT NULL,
    "table_count" INTEGER NOT NULL DEFAULT 0,
    "monthly_flat_fee" DECIMAL(14,4) NOT NULL DEFAULT 0,

    CONSTRAINT "table_royalty_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "raw_material_block" (
    "id" SERIAL NOT NULL,
    "budget_id" INTEGER NOT NULL,
    "block" "supply_block_type" NOT NULL,
    "target_raw_material_pct" DECIMAL(9,6) NOT NULL,

    CONSTRAINT "raw_material_block_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "raw_material_block_month" (
    "id" SERIAL NOT NULL,
    "block_id" INTEGER NOT NULL,
    "month" "month" NOT NULL,
    "base_revenue" DECIMAL(18,4) NOT NULL DEFAULT 0,
    "cigarette_deduction" DECIMAL(18,4) NOT NULL DEFAULT 0,
    "beverage_deduction" DECIMAL(18,4) NOT NULL DEFAULT 0,
    "promo_deduction" DECIMAL(18,4) NOT NULL DEFAULT 0,
    "budgeted_amount" DECIMAL(18,4) NOT NULL DEFAULT 0,

    CONSTRAINT "raw_material_block_month_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "raw_material_monthly_summary" (
    "id" SERIAL NOT NULL,
    "budget_id" INTEGER NOT NULL,
    "month" "month" NOT NULL,
    "fnb_sales" DECIMAL(18,4) NOT NULL DEFAULT 0,
    "cigarette_cost" DECIMAL(18,4) NOT NULL DEFAULT 0,
    "soda_cost" DECIMAL(18,4) NOT NULL DEFAULT 0,
    "supply_cost" DECIMAL(18,4) NOT NULL DEFAULT 0,
    "raw_material_total" DECIMAL(18,4) NOT NULL DEFAULT 0,
    "raw_material_to_sales_pct" DECIMAL(9,6),
    "raw_material_to_gaming_revenue_pct" DECIMAL(9,6),

    CONSTRAINT "raw_material_monthly_summary_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "business_unit_monthly_history" (
    "id" SERIAL NOT NULL,
    "business_unit_id" INTEGER NOT NULL,
    "year" INTEGER NOT NULL,
    "month" "month" NOT NULL,
    "is_estimated" BOOLEAN NOT NULL DEFAULT false,
    "gaming_revenue" DECIMAL(18,4),
    "fnb_revenue" DECIMAL(18,4),
    "fnb_third_party_sales" DECIMAL(18,4),
    "raw_material_total" DECIMAL(18,4),

    CONSTRAINT "business_unit_monthly_history_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "supply_history" (
    "id" SERIAL NOT NULL,
    "business_unit_id" INTEGER NOT NULL,
    "type" "supply_history_type" NOT NULL,
    "year" INTEGER NOT NULL,
    "month" "month" NOT NULL,
    "quantity" DECIMAL(18,4),
    "amount" DECIMAL(18,4),

    CONSTRAINT "supply_history_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pos_provider" (
    "id" SERIAL NOT NULL,
    "code" VARCHAR(30) NOT NULL,
    "name" VARCHAR(120) NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "pos_provider_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pos_rate" (
    "id" SERIAL NOT NULL,
    "vendor_tpv_id" INTEGER NOT NULL,
    "fiscal_year_id" INTEGER NOT NULL,
    "card_type" "card_type" NOT NULL,
    "rate_not_vat" DECIMAL(9,6) NOT NULL,

    CONSTRAINT "pos_rate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pos_fee_line" (
    "id" SERIAL NOT NULL,
    "budget_id" INTEGER NOT NULL,
    "vendor_tpv_id" INTEGER NOT NULL,
    "card_sales_pct" DECIMAL(9,6) NOT NULL,
    "applied_rate_not_vat" DECIMAL(9,6) NOT NULL,
    "passed_to_customer_pct" DECIMAL(9,6) DEFAULT 0,
    "runner_pct" DECIMAL(9,6) DEFAULT 0.2,

    CONSTRAINT "pos_fee_line_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "fixed_asset" (
    "id" SERIAL NOT NULL,
    "budget_id" INTEGER NOT NULL,
    "category_id" INTEGER,
    "description" VARCHAR(200) NOT NULL,
    "purchase_month" "month" NOT NULL,
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "unit_cost" DECIMAL(18,4) NOT NULL DEFAULT 0,
    "useful_life_months" SMALLINT,
    "subject_to_funding" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "fixed_asset_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "monthly_depreciation" (
    "id" SERIAL NOT NULL,
    "budget_id" INTEGER NOT NULL,
    "fixed_asset_id" INTEGER,
    "month" "month" NOT NULL,
    "amount" DECIMAL(18,4) NOT NULL DEFAULT 0,

    CONSTRAINT "monthly_depreciation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "monthly_tax_base" (
    "id" SERIAL NOT NULL,
    "budget_id" INTEGER NOT NULL,
    "tax_line" "tax_line" NOT NULL,
    "month" "month" NOT NULL,
    "netwin" DECIMAL(18,4) NOT NULL DEFAULT 0,
    "netwin_reported" DECIMAL(18,4) NOT NULL DEFAULT 0,
    "sales" DECIMAL(18,4) NOT NULL DEFAULT 0,
    "returns" DECIMAL(18,4) NOT NULL DEFAULT 0,
    "prizes" DECIMAL(18,4) NOT NULL DEFAULT 0,
    "non_cash_prizes" DECIMAL(18,4) NOT NULL DEFAULT 0,
    "taxable_revenue" DECIMAL(18,4),

    CONSTRAINT "monthly_tax_base_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tax_type" (
    "id" SERIAL NOT NULL,
    "code" VARCHAR(40) NOT NULL,
    "name" VARCHAR(150) NOT NULL,
    "area" VARCHAR(20) NOT NULL,
    "calculation_base" VARCHAR(60) NOT NULL,
    "rate" DECIMAL(9,6),

    CONSTRAINT "tax_type_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "monthly_tax" (
    "id" SERIAL NOT NULL,
    "budget_id" INTEGER NOT NULL,
    "tax_type_id" INTEGER NOT NULL,
    "tax_line" "tax_line" NOT NULL,
    "month" "month" NOT NULL,
    "base" DECIMAL(18,4) NOT NULL DEFAULT 0,
    "amount" DECIMAL(18,4) NOT NULL DEFAULT 0,

    CONSTRAINT "monthly_tax_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "monthly_profit_share" (
    "id" SERIAL NOT NULL,
    "budget_id" INTEGER NOT NULL,
    "month" "month" NOT NULL,
    "netwin" DECIMAL(18,4) NOT NULL DEFAULT 0,
    "netwin_reported" DECIMAL(18,4) NOT NULL DEFAULT 0,
    "taxes" DECIMAL(18,4) NOT NULL DEFAULT 0,
    "gross_netwin" DECIMAL(18,4) NOT NULL DEFAULT 0,
    "profit_share_pct" DECIMAL(9,6),
    "profit_share_amount" DECIMAL(18,4) NOT NULL DEFAULT 0,

    CONSTRAINT "monthly_profit_share_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "monthly_actual" (
    "id" SERIAL NOT NULL,
    "line_id" INTEGER NOT NULL,
    "month" "month" NOT NULL,
    "committed_amount" DECIMAL(18,4) NOT NULL DEFAULT 0,
    "paid_amount" DECIMAL(18,4) NOT NULL DEFAULT 0,
    "purchase_order_ref" VARCHAR(60),
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "monthly_actual_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "budget_audit_log" (
    "id" SERIAL NOT NULL,
    "budget_id" INTEGER NOT NULL,
    "user_id" INTEGER,
    "action" VARCHAR(40) NOT NULL,
    "details" JSONB,
    "logged_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "budget_audit_log_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "budget_line_assignment" (
    "id" SERIAL NOT NULL,
    "line_id" INTEGER NOT NULL,
    "user_id" INTEGER NOT NULL,
    "assigned_by" INTEGER NOT NULL,
    "finished" BOOLEAN NOT NULL DEFAULT false,
    "finished_at" TIMESTAMPTZ(6),
    "assigned_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "budget_line_assignment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "comment_thread" (
    "id" SERIAL NOT NULL,
    "system_object_id" INTEGER NOT NULL,
    "record_id" VARCHAR(64) NOT NULL,
    "field" VARCHAR(60),
    "status" "thread_status" NOT NULL DEFAULT 'open',
    "blocking" BOOLEAN NOT NULL DEFAULT false,
    "department_id" INTEGER,
    "business_unit_id" INTEGER,
    "fiscal_year_id" INTEGER,
    "opened_by" INTEGER NOT NULL,
    "resolved_by" INTEGER,
    "resolved_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "comment_thread_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "message" (
    "id" SERIAL NOT NULL,
    "thread_id" INTEGER NOT NULL,
    "parent_message_id" INTEGER,
    "user_id" INTEGER NOT NULL,
    "text" TEXT NOT NULL,
    "edited_at" TIMESTAMPTZ(6),
    "deleted_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "message_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "attachment" (
    "id" SERIAL NOT NULL,
    "message_id" INTEGER NOT NULL,
    "bucket" VARCHAR(80) NOT NULL,
    "object_key" VARCHAR(512) NOT NULL,
    "file_name" VARCHAR(255) NOT NULL,
    "mime" VARCHAR(120),
    "size_bytes" BIGINT,
    "checksum" VARCHAR(128),
    "status" "attachment_status" NOT NULL DEFAULT 'pending',
    "uploaded_by" INTEGER NOT NULL,
    "uploaded_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deleted_at" TIMESTAMPTZ(6),

    CONSTRAINT "attachment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "capture_progress" (
    "id" SERIAL NOT NULL,
    "budget_id" INTEGER NOT NULL,
    "status" "capture_status" NOT NULL DEFAULT 'notStarted',
    "total_lines" INTEGER NOT NULL DEFAULT 0,
    "captured_lines" INTEGER NOT NULL DEFAULT 0,
    "open_threads" INTEGER NOT NULL DEFAULT 0,
    "blocking_threads" INTEGER NOT NULL DEFAULT 0,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "capture_progress_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "review_submission" (
    "id" SERIAL NOT NULL,
    "fiscal_year_id" INTEGER NOT NULL,
    "department_id" INTEGER NOT NULL,
    "version" SMALLINT NOT NULL DEFAULT 1,
    "submitted_by" INTEGER NOT NULL,
    "submitted_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "submitted_units" INTEGER NOT NULL,
    "incomplete_units" INTEGER NOT NULL DEFAULT 0,
    "note" TEXT,

    CONSTRAINT "review_submission_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "review_decision" (
    "id" SERIAL NOT NULL,
    "review_submission_id" INTEGER NOT NULL,
    "budget_id" INTEGER NOT NULL,
    "result" "review_outcome" NOT NULL,
    "decided_by" INTEGER NOT NULL,
    "decided_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "comment" TEXT,

    CONSTRAINT "review_decision_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "app_role" (
    "id" SERIAL NOT NULL,
    "code" VARCHAR(40) NOT NULL,
    "name" VARCHAR(120) NOT NULL,
    "description" VARCHAR(255),
    "bypasses_scope" BOOLEAN NOT NULL DEFAULT false,
    "active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "app_role_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "access_grant" (
    "id" SERIAL NOT NULL,
    "user_id" INTEGER NOT NULL,
    "role_id" INTEGER NOT NULL,
    "department_scope" "scope_mode" NOT NULL DEFAULT 'selected',
    "business_unit_scope" "scope_mode" NOT NULL DEFAULT 'all',
    "cost_center_scope" "scope_mode" NOT NULL DEFAULT 'all',
    "fiscal_year_id" INTEGER,
    "valid_from" DATE NOT NULL DEFAULT CURRENT_DATE,
    "valid_until" DATE,
    "granted_by" INTEGER,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "access_grant_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "access_grant_department" (
    "grant_id" INTEGER NOT NULL,
    "department_id" INTEGER NOT NULL,

    CONSTRAINT "access_grant_department_pkey" PRIMARY KEY ("grant_id","department_id")
);

-- CreateTable
CREATE TABLE "access_grant_business_unit" (
    "grant_id" INTEGER NOT NULL,
    "business_unit_id" INTEGER NOT NULL,

    CONSTRAINT "access_grant_business_unit_pkey" PRIMARY KEY ("grant_id","business_unit_id")
);

-- CreateTable
CREATE TABLE "access_grant_cost_center" (
    "grant_id" INTEGER NOT NULL,
    "cost_center_id" INTEGER NOT NULL,

    CONSTRAINT "access_grant_cost_center_pkey" PRIMARY KEY ("grant_id","cost_center_id")
);

-- CreateTable
CREATE TABLE "user_context" (
    "user_id" INTEGER NOT NULL,
    "business_unit_id" INTEGER NOT NULL,
    "fiscal_year_id" INTEGER NOT NULL,
    "cost_center_id" INTEGER,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_context_pkey" PRIMARY KEY ("user_id")
);

-- CreateTable
CREATE TABLE "access_log" (
    "id" BIGSERIAL NOT NULL,
    "user_id" INTEGER NOT NULL,
    "result" "access_result" NOT NULL,
    "object" VARCHAR(80) NOT NULL,
    "business_unit_id" INTEGER,
    "department_id" INTEGER,
    "ip" INET,
    "user_agent" VARCHAR(255),
    "logged_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "access_log_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "system_object" (
    "id" SERIAL NOT NULL,
    "code" VARCHAR(80) NOT NULL,
    "name" VARCHAR(150) NOT NULL,
    "type" "system_object_type" NOT NULL DEFAULT 'table',
    "module" VARCHAR(40) NOT NULL,
    "department_id" INTEGER,
    "department_path" VARCHAR(255),
    "business_unit_path" VARCHAR(255),
    "commentable" BOOLEAN NOT NULL DEFAULT true,
    "audit_reads" BOOLEAN NOT NULL DEFAULT false,
    "sensitive" BOOLEAN NOT NULL DEFAULT false,
    "active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "system_object_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "permission" (
    "id" SERIAL NOT NULL,
    "system_object_id" INTEGER NOT NULL,
    "action" "action" NOT NULL,
    "field" VARCHAR(60),
    "code" VARCHAR(120) NOT NULL,
    "description" VARCHAR(255),

    CONSTRAINT "permission_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "role_permission" (
    "role_id" INTEGER NOT NULL,
    "permission_id" INTEGER NOT NULL,
    "effect" "permission_effect" NOT NULL DEFAULT 'allow',

    CONSTRAINT "role_permission_pkey" PRIMARY KEY ("role_id","permission_id")
);

-- CreateTable
CREATE TABLE "access_grant_permission" (
    "grant_id" INTEGER NOT NULL,
    "permission_id" INTEGER NOT NULL,
    "effect" "permission_effect" NOT NULL,
    "reason" VARCHAR(255),

    CONSTRAINT "access_grant_permission_pkey" PRIMARY KEY ("grant_id","permission_id")
);

-- CreateTable
CREATE TABLE "business_rule" (
    "id" SERIAL NOT NULL,
    "system_object_id" INTEGER NOT NULL,
    "code" VARCHAR(80) NOT NULL,
    "name" VARCHAR(180) NOT NULL,
    "type" "rule_type" NOT NULL,
    "condition" JSONB,
    "expression" TEXT,
    "message" VARCHAR(255),
    "severity" VARCHAR(20) NOT NULL DEFAULT 'error',
    "department_id" INTEGER,
    "business_unit_id" INTEGER,
    "fiscal_year_id" INTEGER,
    "sort_order" SMALLINT NOT NULL DEFAULT 100,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_by" INTEGER,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "business_rule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "setting" (
    "id" SERIAL NOT NULL,
    "system_object_id" INTEGER,
    "code" VARCHAR(80) NOT NULL,
    "name" VARCHAR(180) NOT NULL,
    "area" "setting_scope" NOT NULL DEFAULT 'global',
    "data_type" VARCHAR(20) NOT NULL DEFAULT 'numeric',
    "value" TEXT NOT NULL,
    "unit" VARCHAR(20),
    "fiscal_year_id" INTEGER,
    "business_unit_id" INTEGER,
    "department_id" INTEGER,
    "cost_center_id" INTEGER,
    "user_id" INTEGER,
    "editable_by_role_id" INTEGER,
    "valid_from" DATE,
    "valid_until" DATE,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "setting_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "auth_user" (
    "id" VARCHAR(64) NOT NULL,
    "name" VARCHAR(255) NOT NULL,
    "email" VARCHAR(255) NOT NULL,
    "email_verified" BOOLEAN NOT NULL DEFAULT false,
    "image" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "auth_user_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "auth_session" (
    "id" VARCHAR(64) NOT NULL,
    "user_id" VARCHAR(64) NOT NULL,
    "token" VARCHAR(255) NOT NULL,
    "expires_at" TIMESTAMPTZ(6) NOT NULL,
    "ip_address" VARCHAR(64),
    "user_agent" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "auth_session_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "auth_account" (
    "id" VARCHAR(64) NOT NULL,
    "user_id" VARCHAR(64) NOT NULL,
    "account_id" VARCHAR(255) NOT NULL,
    "provider_id" VARCHAR(64) NOT NULL,
    "password" TEXT,
    "access_token" TEXT,
    "refresh_token" TEXT,
    "access_token_expires_at" TIMESTAMPTZ(6),
    "refresh_token_expires_at" TIMESTAMPTZ(6),
    "scope" TEXT,
    "id_token" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "auth_account_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "auth_verification" (
    "id" VARCHAR(64) NOT NULL,
    "identifier" VARCHAR(255) NOT NULL,
    "value" VARCHAR(255) NOT NULL,
    "expires_at" TIMESTAMPTZ(6) NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "auth_verification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "metric_definition" (
    "code" "metric_code" NOT NULL,
    "name" VARCHAR(150) NOT NULL,
    "description" TEXT,
    "unit" "metric_unit" NOT NULL,
    "granularity" "metric_granularity" NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "metric_definition_pkey" PRIMARY KEY ("code")
);

-- CreateTable
CREATE TABLE "metric_forecast" (
    "id" VARCHAR(36) NOT NULL DEFAULT gen_random_uuid(),
    "metric_code" "metric_code" NOT NULL,
    "business_unit_id" INTEGER NOT NULL,
    "date" DATE NOT NULL,
    "predicted_value" DECIMAL(18,6) NOT NULL,
    "lower_bound" DECIMAL(18,6),
    "upper_bound" DECIMAL(18,6),
    "confidence_level" DECIMAL(5,4),
    "model" VARCHAR(60),
    "model_version" VARCHAR(40),
    "generated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "metric_forecast_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "company_code_key" ON "company"("code");

-- CreateIndex
CREATE UNIQUE INDEX "business_unit_code_key" ON "business_unit"("code");

-- CreateIndex
CREATE UNIQUE INDEX "cost_center_business_unit_id_code_key" ON "cost_center"("business_unit_id", "code");

-- CreateIndex
CREATE UNIQUE INDEX "app_user_auth_user_id_key" ON "app_user"("auth_user_id");

-- CreateIndex
CREATE UNIQUE INDEX "app_user_email_key" ON "app_user"("email");

-- CreateIndex
CREATE UNIQUE INDEX "department_code_key" ON "department"("code");

-- CreateIndex
CREATE UNIQUE INDEX "fiscal_year_year_key" ON "fiscal_year"("year");

-- CreateIndex
CREATE UNIQUE INDEX "month_calendar_fiscal_year_id_month_key" ON "month_calendar"("fiscal_year_id", "month");

-- CreateIndex
CREATE UNIQUE INDEX "budget_sheet_code_key" ON "budget_sheet"("code");

-- CreateIndex
CREATE UNIQUE INDEX "category_budget_sheet_id_code_key" ON "category"("budget_sheet_id", "code");

-- CreateIndex
CREATE UNIQUE INDEX "line_item_category_id_code_key" ON "line_item"("category_id", "code");

-- CreateIndex
CREATE UNIQUE INDEX "gl_account_code_key" ON "gl_account"("code");

-- CreateIndex
CREATE UNIQUE INDEX "resource_code_key" ON "resource"("code");

-- CreateIndex
CREATE UNIQUE INDEX "resource_value_resource_id_year_component_key" ON "resource_value"("resource_id", "year", "component");

-- CreateIndex
CREATE UNIQUE INDEX "resource_quantity_resource_id_business_unit_id_fiscal_year__key" ON "resource_quantity"("resource_id", "business_unit_id", "fiscal_year_id");

-- CreateIndex
CREATE UNIQUE INDEX "monthly_demand_business_unit_id_fiscal_year_id_month_key" ON "monthly_demand"("business_unit_id", "fiscal_year_id", "month");

-- CreateIndex
CREATE UNIQUE INDEX "resource_factor_resource_id_business_unit_id_fiscal_year_id_key" ON "resource_factor"("resource_id", "business_unit_id", "fiscal_year_id", "code");

-- CreateIndex
CREATE INDEX "budget_fiscal_year_id_is_current_idx" ON "budget"("fiscal_year_id", "is_current");

-- CreateIndex
CREATE UNIQUE INDEX "ux_budget_version" ON "budget"("fiscal_year_id", "business_unit_id", "cost_center_id", "scenario", "version");

-- CreateIndex
CREATE INDEX "budget_line_resource_id_idx" ON "budget_line"("resource_id");

-- CreateIndex
CREATE UNIQUE INDEX "budget_line_budget_id_line_item_id_key" ON "budget_line"("budget_id", "line_item_id");

-- CreateIndex
CREATE INDEX "budget_line_month_month_idx" ON "budget_line_month"("month");

-- CreateIndex
CREATE UNIQUE INDEX "budget_line_month_line_id_month_key" ON "budget_line_month"("line_id", "month");

-- CreateIndex
CREATE UNIQUE INDEX "budget_line_link_target_line_id_source_line_id_key" ON "budget_line_link"("target_line_id", "source_line_id");

-- CreateIndex
CREATE UNIQUE INDEX "monthly_revenue_budget_id_revenue_stream_month_key" ON "monthly_revenue"("budget_id", "revenue_stream", "month");

-- CreateIndex
CREATE INDEX "budgeted_trip_budget_id_destination_month_idx" ON "budgeted_trip"("budget_id", "destination", "month");

-- CreateIndex
CREATE UNIQUE INDEX "license_code_key" ON "license"("code");

-- CreateIndex
CREATE UNIQUE INDEX "license_line_budget_id_license_id_key" ON "license_line"("budget_id", "license_id");

-- CreateIndex
CREATE UNIQUE INDEX "machine_royalty_budget_id_ownership_key" ON "machine_royalty"("budget_id", "ownership");

-- CreateIndex
CREATE UNIQUE INDEX "table_royalty_budget_id_key" ON "table_royalty"("budget_id");

-- CreateIndex
CREATE UNIQUE INDEX "raw_material_block_budget_id_block_key" ON "raw_material_block"("budget_id", "block");

-- CreateIndex
CREATE UNIQUE INDEX "raw_material_block_month_block_id_month_key" ON "raw_material_block_month"("block_id", "month");

-- CreateIndex
CREATE UNIQUE INDEX "raw_material_monthly_summary_budget_id_month_key" ON "raw_material_monthly_summary"("budget_id", "month");

-- CreateIndex
CREATE UNIQUE INDEX "business_unit_monthly_history_business_unit_id_year_month_key" ON "business_unit_monthly_history"("business_unit_id", "year", "month");

-- CreateIndex
CREATE UNIQUE INDEX "supply_history_business_unit_id_type_year_month_key" ON "supply_history"("business_unit_id", "type", "year", "month");

-- CreateIndex
CREATE UNIQUE INDEX "pos_provider_code_key" ON "pos_provider"("code");

-- CreateIndex
CREATE UNIQUE INDEX "pos_rate_vendor_tpv_id_fiscal_year_id_card_type_key" ON "pos_rate"("vendor_tpv_id", "fiscal_year_id", "card_type");

-- CreateIndex
CREATE UNIQUE INDEX "pos_fee_line_budget_id_vendor_tpv_id_key" ON "pos_fee_line"("budget_id", "vendor_tpv_id");

-- CreateIndex
CREATE INDEX "monthly_depreciation_budget_id_month_idx" ON "monthly_depreciation"("budget_id", "month");

-- CreateIndex
CREATE UNIQUE INDEX "monthly_tax_base_budget_id_tax_line_month_key" ON "monthly_tax_base"("budget_id", "tax_line", "month");

-- CreateIndex
CREATE UNIQUE INDEX "tax_type_code_key" ON "tax_type"("code");

-- CreateIndex
CREATE UNIQUE INDEX "monthly_tax_budget_id_tax_type_id_tax_line_month_key" ON "monthly_tax"("budget_id", "tax_type_id", "tax_line", "month");

-- CreateIndex
CREATE UNIQUE INDEX "monthly_profit_share_budget_id_month_key" ON "monthly_profit_share"("budget_id", "month");

-- CreateIndex
CREATE UNIQUE INDEX "monthly_actual_line_id_month_key" ON "monthly_actual"("line_id", "month");

-- CreateIndex
CREATE INDEX "budget_audit_log_budget_id_logged_at_idx" ON "budget_audit_log"("budget_id", "logged_at");

-- CreateIndex
CREATE INDEX "budget_line_assignment_user_id_idx" ON "budget_line_assignment"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "ux_un_responsable_per_line" ON "budget_line_assignment"("line_id");

-- CreateIndex
CREATE INDEX "ix_thread_ancla" ON "comment_thread"("system_object_id", "record_id", "field");

-- CreateIndex
CREATE INDEX "comment_thread_status_blocking_idx" ON "comment_thread"("status", "blocking");

-- CreateIndex
CREATE INDEX "ix_thread_scope" ON "comment_thread"("department_id", "business_unit_id", "fiscal_year_id");

-- CreateIndex
CREATE INDEX "message_thread_id_created_at_idx" ON "message"("thread_id", "created_at");

-- CreateIndex
CREATE INDEX "message_parent_message_id_idx" ON "message"("parent_message_id");

-- CreateIndex
CREATE INDEX "attachment_message_id_idx" ON "attachment"("message_id");

-- CreateIndex
CREATE INDEX "ix_attachment_pendientes" ON "attachment"("status");

-- CreateIndex
CREATE UNIQUE INDEX "attachment_bucket_object_key_key" ON "attachment"("bucket", "object_key");

-- CreateIndex
CREATE UNIQUE INDEX "capture_progress_budget_id_key" ON "capture_progress"("budget_id");

-- CreateIndex
CREATE UNIQUE INDEX "review_submission_fiscal_year_id_department_id_version_key" ON "review_submission"("fiscal_year_id", "department_id", "version");

-- CreateIndex
CREATE UNIQUE INDEX "review_decision_review_submission_id_budget_id_key" ON "review_decision"("review_submission_id", "budget_id");

-- CreateIndex
CREATE UNIQUE INDEX "app_role_code_key" ON "app_role"("code");

-- CreateIndex
CREATE INDEX "access_grant_user_id_idx" ON "access_grant"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "ux_grant_vigente" ON "access_grant"("user_id", "role_id", "fiscal_year_id");

-- CreateIndex
CREATE INDEX "access_log_user_id_logged_at_idx" ON "access_log"("user_id", "logged_at");

-- CreateIndex
CREATE INDEX "ix_log_access_denegados" ON "access_log"("result", "logged_at");

-- CreateIndex
CREATE UNIQUE INDEX "system_object_code_key" ON "system_object"("code");

-- CreateIndex
CREATE UNIQUE INDEX "permission_code_key" ON "permission"("code");

-- CreateIndex
CREATE UNIQUE INDEX "permission_system_object_id_action_field_key" ON "permission"("system_object_id", "action", "field");

-- CreateIndex
CREATE INDEX "business_rule_system_object_id_active_sort_order_idx" ON "business_rule"("system_object_id", "active", "sort_order");

-- CreateIndex
CREATE UNIQUE INDEX "business_rule_system_object_id_code_key" ON "business_rule"("system_object_id", "code");

-- CreateIndex
CREATE UNIQUE INDEX "ux_setting_per_scope" ON "setting"("code", "area", "fiscal_year_id", "business_unit_id", "department_id");

-- CreateIndex
CREATE UNIQUE INDEX "auth_user_email_key" ON "auth_user"("email");

-- CreateIndex
CREATE UNIQUE INDEX "auth_session_token_key" ON "auth_session"("token");

-- CreateIndex
CREATE INDEX "auth_session_user_id_idx" ON "auth_session"("user_id");

-- CreateIndex
CREATE INDEX "auth_account_user_id_idx" ON "auth_account"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "auth_account_provider_id_account_id_key" ON "auth_account"("provider_id", "account_id");

-- CreateIndex
CREATE INDEX "auth_verification_identifier_idx" ON "auth_verification"("identifier");

-- CreateIndex
CREATE INDEX "metric_forecast_business_unit_id_date_idx" ON "metric_forecast"("business_unit_id", "date");

-- CreateIndex
CREATE UNIQUE INDEX "metric_forecast_metric_code_business_unit_id_date_generated_key" ON "metric_forecast"("metric_code", "business_unit_id", "date", "generated_at");

-- AddForeignKey
ALTER TABLE "business_unit" ADD CONSTRAINT "business_unit_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cost_center" ADD CONSTRAINT "cost_center_business_unit_id_fkey" FOREIGN KEY ("business_unit_id") REFERENCES "business_unit"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app_user" ADD CONSTRAINT "app_user_department_id_fkey" FOREIGN KEY ("department_id") REFERENCES "department"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app_user" ADD CONSTRAINT "app_user_auth_user_id_fkey" FOREIGN KEY ("auth_user_id") REFERENCES "auth_user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fiscal_year" ADD CONSTRAINT "fiscal_year_closed_by_fkey" FOREIGN KEY ("closed_by") REFERENCES "app_user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "month_calendar" ADD CONSTRAINT "month_calendar_fiscal_year_id_fkey" FOREIGN KEY ("fiscal_year_id") REFERENCES "fiscal_year"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "budget_sheet" ADD CONSTRAINT "budget_sheet_department_id_fkey" FOREIGN KEY ("department_id") REFERENCES "department"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "budget_sheet_note" ADD CONSTRAINT "budget_sheet_note_budget_sheet_id_fkey" FOREIGN KEY ("budget_sheet_id") REFERENCES "budget_sheet"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "category" ADD CONSTRAINT "category_budget_sheet_id_fkey" FOREIGN KEY ("budget_sheet_id") REFERENCES "budget_sheet"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "category" ADD CONSTRAINT "category_parent_category_id_fkey" FOREIGN KEY ("parent_category_id") REFERENCES "category"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "category" ADD CONSTRAINT "category_department_id_fkey" FOREIGN KEY ("department_id") REFERENCES "department"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "category" ADD CONSTRAINT "category_owner_user_id_fkey" FOREIGN KEY ("owner_user_id") REFERENCES "app_user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "line_item" ADD CONSTRAINT "line_item_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "category"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "resource" ADD CONSTRAINT "resource_department_id_fkey" FOREIGN KEY ("department_id") REFERENCES "department"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "resource" ADD CONSTRAINT "resource_gl_account_id_fkey" FOREIGN KEY ("gl_account_id") REFERENCES "gl_account"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "resource_value" ADD CONSTRAINT "resource_value_resource_id_fkey" FOREIGN KEY ("resource_id") REFERENCES "resource"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "resource_value" ADD CONSTRAINT "resource_value_confirmed_by_fkey" FOREIGN KEY ("confirmed_by") REFERENCES "app_user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "resource_quantity" ADD CONSTRAINT "resource_quantity_resource_id_fkey" FOREIGN KEY ("resource_id") REFERENCES "resource"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "resource_quantity" ADD CONSTRAINT "resource_quantity_business_unit_id_fkey" FOREIGN KEY ("business_unit_id") REFERENCES "business_unit"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "resource_quantity" ADD CONSTRAINT "resource_quantity_fiscal_year_id_fkey" FOREIGN KEY ("fiscal_year_id") REFERENCES "fiscal_year"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "monthly_demand" ADD CONSTRAINT "monthly_demand_business_unit_id_fkey" FOREIGN KEY ("business_unit_id") REFERENCES "business_unit"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "monthly_demand" ADD CONSTRAINT "monthly_demand_fiscal_year_id_fkey" FOREIGN KEY ("fiscal_year_id") REFERENCES "fiscal_year"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "resource_factor" ADD CONSTRAINT "resource_factor_resource_id_fkey" FOREIGN KEY ("resource_id") REFERENCES "resource"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "resource_factor" ADD CONSTRAINT "resource_factor_business_unit_id_fkey" FOREIGN KEY ("business_unit_id") REFERENCES "business_unit"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "resource_factor" ADD CONSTRAINT "resource_factor_fiscal_year_id_fkey" FOREIGN KEY ("fiscal_year_id") REFERENCES "fiscal_year"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "resource_recalculation" ADD CONSTRAINT "resource_recalculation_resource_id_fkey" FOREIGN KEY ("resource_id") REFERENCES "resource"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "resource_recalculation" ADD CONSTRAINT "resource_recalculation_fiscal_year_id_fkey" FOREIGN KEY ("fiscal_year_id") REFERENCES "fiscal_year"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "resource_recalculation" ADD CONSTRAINT "resource_recalculation_triggered_by_fkey" FOREIGN KEY ("triggered_by") REFERENCES "app_user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "budget" ADD CONSTRAINT "budget_fiscal_year_id_fkey" FOREIGN KEY ("fiscal_year_id") REFERENCES "fiscal_year"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "budget" ADD CONSTRAINT "budget_business_unit_id_fkey" FOREIGN KEY ("business_unit_id") REFERENCES "business_unit"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "budget" ADD CONSTRAINT "budget_cost_center_id_fkey" FOREIGN KEY ("cost_center_id") REFERENCES "cost_center"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "budget" ADD CONSTRAINT "budget_approved_by_fkey" FOREIGN KEY ("approved_by") REFERENCES "app_user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "budget_line" ADD CONSTRAINT "budget_line_budget_id_fkey" FOREIGN KEY ("budget_id") REFERENCES "budget"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "budget_line" ADD CONSTRAINT "budget_line_line_item_id_fkey" FOREIGN KEY ("line_item_id") REFERENCES "line_item"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "budget_line" ADD CONSTRAINT "budget_line_resource_id_fkey" FOREIGN KEY ("resource_id") REFERENCES "resource"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "budget_line" ADD CONSTRAINT "budget_line_gl_account_id_fkey" FOREIGN KEY ("gl_account_id") REFERENCES "gl_account"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "budget_line" ADD CONSTRAINT "budget_line_department_id_fkey" FOREIGN KEY ("department_id") REFERENCES "department"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "budget_line_month" ADD CONSTRAINT "budget_line_month_line_id_fkey" FOREIGN KEY ("line_id") REFERENCES "budget_line"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "budget_line_link" ADD CONSTRAINT "budget_line_link_target_line_id_fkey" FOREIGN KEY ("target_line_id") REFERENCES "budget_line"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "budget_line_link" ADD CONSTRAINT "budget_line_link_source_line_id_fkey" FOREIGN KEY ("source_line_id") REFERENCES "budget_line"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "monthly_revenue" ADD CONSTRAINT "monthly_revenue_budget_id_fkey" FOREIGN KEY ("budget_id") REFERENCES "budget"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payroll_benefit" ADD CONSTRAINT "payroll_benefit_budget_id_fkey" FOREIGN KEY ("budget_id") REFERENCES "budget"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "team_event" ADD CONSTRAINT "team_event_budget_id_fkey" FOREIGN KEY ("budget_id") REFERENCES "budget"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "team_event" ADD CONSTRAINT "team_event_line_item_id_fkey" FOREIGN KEY ("line_item_id") REFERENCES "line_item"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "budgeted_trip" ADD CONSTRAINT "budgeted_trip_budget_id_fkey" FOREIGN KEY ("budget_id") REFERENCES "budget"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "license_line" ADD CONSTRAINT "license_line_budget_id_fkey" FOREIGN KEY ("budget_id") REFERENCES "budget"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "license_line" ADD CONSTRAINT "license_line_license_id_fkey" FOREIGN KEY ("license_id") REFERENCES "license"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "machine_royalty" ADD CONSTRAINT "machine_royalty_budget_id_fkey" FOREIGN KEY ("budget_id") REFERENCES "budget"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "table_royalty" ADD CONSTRAINT "table_royalty_budget_id_fkey" FOREIGN KEY ("budget_id") REFERENCES "budget"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "raw_material_block" ADD CONSTRAINT "raw_material_block_budget_id_fkey" FOREIGN KEY ("budget_id") REFERENCES "budget"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "raw_material_block_month" ADD CONSTRAINT "raw_material_block_month_block_id_fkey" FOREIGN KEY ("block_id") REFERENCES "raw_material_block"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "raw_material_monthly_summary" ADD CONSTRAINT "raw_material_monthly_summary_budget_id_fkey" FOREIGN KEY ("budget_id") REFERENCES "budget"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "business_unit_monthly_history" ADD CONSTRAINT "business_unit_monthly_history_business_unit_id_fkey" FOREIGN KEY ("business_unit_id") REFERENCES "business_unit"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "supply_history" ADD CONSTRAINT "supply_history_business_unit_id_fkey" FOREIGN KEY ("business_unit_id") REFERENCES "business_unit"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pos_rate" ADD CONSTRAINT "pos_rate_vendor_tpv_id_fkey" FOREIGN KEY ("vendor_tpv_id") REFERENCES "pos_provider"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pos_rate" ADD CONSTRAINT "pos_rate_fiscal_year_id_fkey" FOREIGN KEY ("fiscal_year_id") REFERENCES "fiscal_year"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pos_fee_line" ADD CONSTRAINT "pos_fee_line_budget_id_fkey" FOREIGN KEY ("budget_id") REFERENCES "budget"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pos_fee_line" ADD CONSTRAINT "pos_fee_line_vendor_tpv_id_fkey" FOREIGN KEY ("vendor_tpv_id") REFERENCES "pos_provider"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fixed_asset" ADD CONSTRAINT "fixed_asset_budget_id_fkey" FOREIGN KEY ("budget_id") REFERENCES "budget"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fixed_asset" ADD CONSTRAINT "fixed_asset_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "category"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "monthly_depreciation" ADD CONSTRAINT "monthly_depreciation_budget_id_fkey" FOREIGN KEY ("budget_id") REFERENCES "budget"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "monthly_depreciation" ADD CONSTRAINT "monthly_depreciation_fixed_asset_id_fkey" FOREIGN KEY ("fixed_asset_id") REFERENCES "fixed_asset"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "monthly_tax_base" ADD CONSTRAINT "monthly_tax_base_budget_id_fkey" FOREIGN KEY ("budget_id") REFERENCES "budget"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "monthly_tax" ADD CONSTRAINT "monthly_tax_budget_id_fkey" FOREIGN KEY ("budget_id") REFERENCES "budget"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "monthly_tax" ADD CONSTRAINT "monthly_tax_tax_type_id_fkey" FOREIGN KEY ("tax_type_id") REFERENCES "tax_type"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "monthly_profit_share" ADD CONSTRAINT "monthly_profit_share_budget_id_fkey" FOREIGN KEY ("budget_id") REFERENCES "budget"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "monthly_actual" ADD CONSTRAINT "monthly_actual_line_id_fkey" FOREIGN KEY ("line_id") REFERENCES "budget_line"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "budget_audit_log" ADD CONSTRAINT "budget_audit_log_budget_id_fkey" FOREIGN KEY ("budget_id") REFERENCES "budget"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "budget_audit_log" ADD CONSTRAINT "budget_audit_log_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "app_user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "budget_line_assignment" ADD CONSTRAINT "budget_line_assignment_line_id_fkey" FOREIGN KEY ("line_id") REFERENCES "budget_line"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "budget_line_assignment" ADD CONSTRAINT "budget_line_assignment_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "app_user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "budget_line_assignment" ADD CONSTRAINT "budget_line_assignment_assigned_by_fkey" FOREIGN KEY ("assigned_by") REFERENCES "app_user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "comment_thread" ADD CONSTRAINT "comment_thread_system_object_id_fkey" FOREIGN KEY ("system_object_id") REFERENCES "system_object"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "comment_thread" ADD CONSTRAINT "comment_thread_department_id_fkey" FOREIGN KEY ("department_id") REFERENCES "department"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "comment_thread" ADD CONSTRAINT "comment_thread_business_unit_id_fkey" FOREIGN KEY ("business_unit_id") REFERENCES "business_unit"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "comment_thread" ADD CONSTRAINT "comment_thread_fiscal_year_id_fkey" FOREIGN KEY ("fiscal_year_id") REFERENCES "fiscal_year"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "comment_thread" ADD CONSTRAINT "comment_thread_opened_by_fkey" FOREIGN KEY ("opened_by") REFERENCES "app_user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "comment_thread" ADD CONSTRAINT "comment_thread_resolved_by_fkey" FOREIGN KEY ("resolved_by") REFERENCES "app_user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "message" ADD CONSTRAINT "message_thread_id_fkey" FOREIGN KEY ("thread_id") REFERENCES "comment_thread"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "message" ADD CONSTRAINT "message_parent_message_id_fkey" FOREIGN KEY ("parent_message_id") REFERENCES "message"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "message" ADD CONSTRAINT "message_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "app_user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attachment" ADD CONSTRAINT "attachment_message_id_fkey" FOREIGN KEY ("message_id") REFERENCES "message"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attachment" ADD CONSTRAINT "attachment_uploaded_by_fkey" FOREIGN KEY ("uploaded_by") REFERENCES "app_user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "capture_progress" ADD CONSTRAINT "capture_progress_budget_id_fkey" FOREIGN KEY ("budget_id") REFERENCES "budget"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "review_submission" ADD CONSTRAINT "review_submission_fiscal_year_id_fkey" FOREIGN KEY ("fiscal_year_id") REFERENCES "fiscal_year"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "review_submission" ADD CONSTRAINT "review_submission_department_id_fkey" FOREIGN KEY ("department_id") REFERENCES "department"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "review_submission" ADD CONSTRAINT "review_submission_submitted_by_fkey" FOREIGN KEY ("submitted_by") REFERENCES "app_user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "review_decision" ADD CONSTRAINT "review_decision_review_submission_id_fkey" FOREIGN KEY ("review_submission_id") REFERENCES "review_submission"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "review_decision" ADD CONSTRAINT "review_decision_budget_id_fkey" FOREIGN KEY ("budget_id") REFERENCES "budget"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "review_decision" ADD CONSTRAINT "review_decision_decided_by_fkey" FOREIGN KEY ("decided_by") REFERENCES "app_user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "access_grant" ADD CONSTRAINT "access_grant_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "app_user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "access_grant" ADD CONSTRAINT "access_grant_role_id_fkey" FOREIGN KEY ("role_id") REFERENCES "app_role"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "access_grant" ADD CONSTRAINT "access_grant_fiscal_year_id_fkey" FOREIGN KEY ("fiscal_year_id") REFERENCES "fiscal_year"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "access_grant" ADD CONSTRAINT "access_grant_granted_by_fkey" FOREIGN KEY ("granted_by") REFERENCES "app_user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "access_grant_department" ADD CONSTRAINT "access_grant_department_grant_id_fkey" FOREIGN KEY ("grant_id") REFERENCES "access_grant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "access_grant_department" ADD CONSTRAINT "access_grant_department_department_id_fkey" FOREIGN KEY ("department_id") REFERENCES "department"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "access_grant_business_unit" ADD CONSTRAINT "access_grant_business_unit_grant_id_fkey" FOREIGN KEY ("grant_id") REFERENCES "access_grant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "access_grant_business_unit" ADD CONSTRAINT "access_grant_business_unit_business_unit_id_fkey" FOREIGN KEY ("business_unit_id") REFERENCES "business_unit"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "access_grant_cost_center" ADD CONSTRAINT "access_grant_cost_center_grant_id_fkey" FOREIGN KEY ("grant_id") REFERENCES "access_grant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "access_grant_cost_center" ADD CONSTRAINT "access_grant_cost_center_cost_center_id_fkey" FOREIGN KEY ("cost_center_id") REFERENCES "cost_center"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_context" ADD CONSTRAINT "user_context_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "app_user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_context" ADD CONSTRAINT "user_context_business_unit_id_fkey" FOREIGN KEY ("business_unit_id") REFERENCES "business_unit"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_context" ADD CONSTRAINT "user_context_fiscal_year_id_fkey" FOREIGN KEY ("fiscal_year_id") REFERENCES "fiscal_year"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_context" ADD CONSTRAINT "user_context_cost_center_id_fkey" FOREIGN KEY ("cost_center_id") REFERENCES "cost_center"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "access_log" ADD CONSTRAINT "access_log_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "app_user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "access_log" ADD CONSTRAINT "access_log_business_unit_id_fkey" FOREIGN KEY ("business_unit_id") REFERENCES "business_unit"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "access_log" ADD CONSTRAINT "access_log_department_id_fkey" FOREIGN KEY ("department_id") REFERENCES "department"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "system_object" ADD CONSTRAINT "system_object_department_id_fkey" FOREIGN KEY ("department_id") REFERENCES "department"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "permission" ADD CONSTRAINT "permission_system_object_id_fkey" FOREIGN KEY ("system_object_id") REFERENCES "system_object"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "role_permission" ADD CONSTRAINT "role_permission_role_id_fkey" FOREIGN KEY ("role_id") REFERENCES "app_role"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "role_permission" ADD CONSTRAINT "role_permission_permission_id_fkey" FOREIGN KEY ("permission_id") REFERENCES "permission"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "access_grant_permission" ADD CONSTRAINT "access_grant_permission_grant_id_fkey" FOREIGN KEY ("grant_id") REFERENCES "access_grant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "access_grant_permission" ADD CONSTRAINT "access_grant_permission_permission_id_fkey" FOREIGN KEY ("permission_id") REFERENCES "permission"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "business_rule" ADD CONSTRAINT "business_rule_system_object_id_fkey" FOREIGN KEY ("system_object_id") REFERENCES "system_object"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "business_rule" ADD CONSTRAINT "business_rule_department_id_fkey" FOREIGN KEY ("department_id") REFERENCES "department"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "business_rule" ADD CONSTRAINT "business_rule_business_unit_id_fkey" FOREIGN KEY ("business_unit_id") REFERENCES "business_unit"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "business_rule" ADD CONSTRAINT "business_rule_fiscal_year_id_fkey" FOREIGN KEY ("fiscal_year_id") REFERENCES "fiscal_year"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "business_rule" ADD CONSTRAINT "business_rule_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "app_user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "setting" ADD CONSTRAINT "setting_system_object_id_fkey" FOREIGN KEY ("system_object_id") REFERENCES "system_object"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "setting" ADD CONSTRAINT "setting_fiscal_year_id_fkey" FOREIGN KEY ("fiscal_year_id") REFERENCES "fiscal_year"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "setting" ADD CONSTRAINT "setting_business_unit_id_fkey" FOREIGN KEY ("business_unit_id") REFERENCES "business_unit"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "setting" ADD CONSTRAINT "setting_department_id_fkey" FOREIGN KEY ("department_id") REFERENCES "department"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "setting" ADD CONSTRAINT "setting_cost_center_id_fkey" FOREIGN KEY ("cost_center_id") REFERENCES "cost_center"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "setting" ADD CONSTRAINT "setting_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "app_user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "setting" ADD CONSTRAINT "setting_editable_by_role_id_fkey" FOREIGN KEY ("editable_by_role_id") REFERENCES "app_role"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "auth_session" ADD CONSTRAINT "auth_session_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth_user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "auth_account" ADD CONSTRAINT "auth_account_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth_user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "metric_forecast" ADD CONSTRAINT "metric_forecast_metric_code_fkey" FOREIGN KEY ("metric_code") REFERENCES "metric_definition"("code") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "metric_forecast" ADD CONSTRAINT "metric_forecast_business_unit_id_fkey" FOREIGN KEY ("business_unit_id") REFERENCES "business_unit"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

