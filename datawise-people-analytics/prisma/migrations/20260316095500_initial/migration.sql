-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateTable
CREATE TABLE "Company" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "industry" TEXT,
    "employeeCount" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Company_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Department" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "parentId" TEXT,

    CONSTRAINT "Department_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Employee" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "departmentId" TEXT,
    "managerId" TEXT,
    "externalCode" TEXT,
    "firstName" TEXT,
    "lastName" TEXT,
    "hireDate" TIMESTAMP(3) NOT NULL,
    "terminationDate" TIMESTAMP(3),
    "jobTitle" TEXT,
    "jobLevel" TEXT,
    "contractType" TEXT,
    "location" TEXT,
    "workMode" TEXT,
    "ageBand" TEXT,
    "gender" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Employee_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Absence" (
    "id" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "days" INTEGER NOT NULL,
    "type" TEXT,

    CONSTRAINT "Absence_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Promotion" (
    "id" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "effectiveAt" TIMESTAMP(3) NOT NULL,
    "oldLevel" TEXT,
    "newLevel" TEXT,

    CONSTRAINT "Promotion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PerformanceReview" (
    "id" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "reviewDate" TIMESTAMP(3) NOT NULL,
    "score" DOUBLE PRECISION NOT NULL,
    "reviewer" TEXT,

    CONSTRAINT "PerformanceReview_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Survey" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Survey_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SurveyResponse" (
    "id" TEXT NOT NULL,
    "surveyId" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "dimension" TEXT NOT NULL,
    "score" DOUBLE PRECISION NOT NULL,

    CONSTRAINT "SurveyResponse_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EmployeeRiskScore" (
    "id" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "scoringDate" TIMESTAMP(3) NOT NULL,
    "attritionRisk" DOUBLE PRECISION NOT NULL,
    "burnoutRisk" DOUBLE PRECISION NOT NULL,
    "driver1" TEXT,
    "driver2" TEXT,
    "driver3" TEXT,

    CONSTRAINT "EmployeeRiskScore_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TeamMetricsMonthly" (
    "id" TEXT NOT NULL,
    "departmentId" TEXT NOT NULL,
    "month" TIMESTAMP(3) NOT NULL,
    "headcount" INTEGER NOT NULL,
    "turnoverRate" DOUBLE PRECISION NOT NULL,
    "absenteeismRate" DOUBLE PRECISION NOT NULL,
    "engagementScore" DOUBLE PRECISION NOT NULL,
    "burnoutRiskAvg" DOUBLE PRECISION NOT NULL,
    "attritionRiskAvg" DOUBLE PRECISION NOT NULL,

    CONSTRAINT "TeamMetricsMonthly_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ImportRun" (
    "id" TEXT NOT NULL,
    "companyId" TEXT,
    "companyNameSnapshot" TEXT,
    "dataset" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "fileType" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "hasHeader" BOOLEAN NOT NULL,
    "totalRows" INTEGER NOT NULL,
    "importedCount" INTEGER,
    "createdCount" INTEGER,
    "updatedCount" INTEGER,
    "issueCount" INTEGER NOT NULL DEFAULT 0,
    "errorMessage" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ImportRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ImportRunIssue" (
    "id" TEXT NOT NULL,
    "runId" TEXT NOT NULL,
    "rowNumber" INTEGER NOT NULL,
    "field" TEXT NOT NULL,
    "message" TEXT NOT NULL,

    CONSTRAINT "ImportRunIssue_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Company_name_idx" ON "Company"("name");

-- CreateIndex
CREATE INDEX "Department_companyId_idx" ON "Department"("companyId");

-- CreateIndex
CREATE INDEX "Department_parentId_idx" ON "Department"("parentId");

-- CreateIndex
CREATE UNIQUE INDEX "Department_companyId_name_key" ON "Department"("companyId", "name");

-- CreateIndex
CREATE INDEX "Employee_companyId_idx" ON "Employee"("companyId");

-- CreateIndex
CREATE INDEX "Employee_departmentId_idx" ON "Employee"("departmentId");

-- CreateIndex
CREATE INDEX "Employee_managerId_idx" ON "Employee"("managerId");

-- CreateIndex
CREATE INDEX "Employee_externalCode_idx" ON "Employee"("externalCode");

-- CreateIndex
CREATE INDEX "Absence_employeeId_idx" ON "Absence"("employeeId");

-- CreateIndex
CREATE INDEX "Absence_date_idx" ON "Absence"("date");

-- CreateIndex
CREATE INDEX "Promotion_employeeId_idx" ON "Promotion"("employeeId");

-- CreateIndex
CREATE INDEX "Promotion_effectiveAt_idx" ON "Promotion"("effectiveAt");

-- CreateIndex
CREATE INDEX "PerformanceReview_employeeId_idx" ON "PerformanceReview"("employeeId");

-- CreateIndex
CREATE INDEX "PerformanceReview_reviewDate_idx" ON "PerformanceReview"("reviewDate");

-- CreateIndex
CREATE INDEX "Survey_companyId_idx" ON "Survey"("companyId");

-- CreateIndex
CREATE INDEX "Survey_createdAt_idx" ON "Survey"("createdAt");

-- CreateIndex
CREATE INDEX "SurveyResponse_surveyId_idx" ON "SurveyResponse"("surveyId");

-- CreateIndex
CREATE INDEX "SurveyResponse_employeeId_idx" ON "SurveyResponse"("employeeId");

-- CreateIndex
CREATE INDEX "SurveyResponse_dimension_idx" ON "SurveyResponse"("dimension");

-- CreateIndex
CREATE INDEX "EmployeeRiskScore_employeeId_idx" ON "EmployeeRiskScore"("employeeId");

-- CreateIndex
CREATE INDEX "EmployeeRiskScore_scoringDate_idx" ON "EmployeeRiskScore"("scoringDate");

-- CreateIndex
CREATE UNIQUE INDEX "EmployeeRiskScore_employeeId_scoringDate_key" ON "EmployeeRiskScore"("employeeId", "scoringDate");

-- CreateIndex
CREATE INDEX "TeamMetricsMonthly_departmentId_idx" ON "TeamMetricsMonthly"("departmentId");

-- CreateIndex
CREATE INDEX "TeamMetricsMonthly_month_idx" ON "TeamMetricsMonthly"("month");

-- CreateIndex
CREATE UNIQUE INDEX "TeamMetricsMonthly_departmentId_month_key" ON "TeamMetricsMonthly"("departmentId", "month");

-- CreateIndex
CREATE INDEX "ImportRun_companyId_createdAt_idx" ON "ImportRun"("companyId", "createdAt");

-- CreateIndex
CREATE INDEX "ImportRun_status_createdAt_idx" ON "ImportRun"("status", "createdAt");

-- CreateIndex
CREATE INDEX "ImportRun_dataset_createdAt_idx" ON "ImportRun"("dataset", "createdAt");

-- CreateIndex
CREATE INDEX "ImportRunIssue_runId_idx" ON "ImportRunIssue"("runId");

-- AddForeignKey
ALTER TABLE "Department" ADD CONSTRAINT "Department_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Department" ADD CONSTRAINT "Department_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "Department"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Employee" ADD CONSTRAINT "Employee_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Employee" ADD CONSTRAINT "Employee_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "Department"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Employee" ADD CONSTRAINT "Employee_managerId_fkey" FOREIGN KEY ("managerId") REFERENCES "Employee"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Absence" ADD CONSTRAINT "Absence_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Promotion" ADD CONSTRAINT "Promotion_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PerformanceReview" ADD CONSTRAINT "PerformanceReview_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Survey" ADD CONSTRAINT "Survey_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SurveyResponse" ADD CONSTRAINT "SurveyResponse_surveyId_fkey" FOREIGN KEY ("surveyId") REFERENCES "Survey"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SurveyResponse" ADD CONSTRAINT "SurveyResponse_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmployeeRiskScore" ADD CONSTRAINT "EmployeeRiskScore_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TeamMetricsMonthly" ADD CONSTRAINT "TeamMetricsMonthly_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "Department"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ImportRun" ADD CONSTRAINT "ImportRun_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ImportRunIssue" ADD CONSTRAINT "ImportRunIssue_runId_fkey" FOREIGN KEY ("runId") REFERENCES "ImportRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;
