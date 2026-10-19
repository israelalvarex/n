CREATE TABLE "budget_sheet_review" (
  "budget_id" INTEGER NOT NULL REFERENCES "budget"("id") ON DELETE RESTRICT,
  "department_id" INTEGER NOT NULL REFERENCES "department"("id") ON DELETE RESTRICT,
  "review_submission_id" INTEGER NOT NULL REFERENCES "review_submission"("id") ON DELETE RESTRICT,
  "status" "budget_status" NOT NULL DEFAULT 'inReview',
  "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT now(),
  CONSTRAINT "budget_sheet_review_pkey" PRIMARY KEY ("budget_id", "department_id")
);

CREATE INDEX "budget_sheet_review_review_submission_id_idx" ON "budget_sheet_review"("review_submission_id");

-- Recupera las hojas ya enviadas antes de esta corrección. La marca de lista
-- identifica el departamento; el estado anterior del Budget identificaba el
-- casino. Una decisión existente prevalece sobre ese estado compartido.
INSERT INTO "budget_sheet_review" ("budget_id", "department_id", "review_submission_id", "status")
SELECT b.id, ready.department_id, envio.id,
  CASE WHEN decision.result = 'approvedAndFrozen' THEN 'approved'::"budget_status"
       WHEN decision.id IS NOT NULL THEN 'draft'::"budget_status"
       ELSE 'inReview'::"budget_status" END
FROM "setting" ready
JOIN "budget" b ON b.fiscal_year_id = ready.fiscal_year_id
  AND b.business_unit_id = ready.business_unit_id AND b.is_current = true
JOIN LATERAL (
  SELECT s.id, s.submitted_at FROM "review_submission" s
  WHERE s.fiscal_year_id = ready.fiscal_year_id
    AND s.department_id = ready.department_id
  ORDER BY s.version DESC LIMIT 1
) envio ON true
LEFT JOIN "review_decision" decision
  ON decision.review_submission_id = envio.id AND decision.budget_id = b.id
WHERE ready.code = 'budget_sheet.ready'
  AND ready.updated_at <= envio.submitted_at
ON CONFLICT ("budget_id", "department_id") DO NOTHING;
