-- Reforma Tributaria do Consumo - NT 2025.002 foundation.
-- Fase 1: classificacoes, aliquotas por vigencia, destino IBGE e finalidade NF-e.

CREATE TYPE "NFeIssuePurpose" AS ENUM (
  'NORMAL',
  'COMPLEMENTARY',
  'ADJUSTMENT',
  'RETURN',
  'DEBIT_NOTE',
  'CREDIT_NOTE'
);

CREATE TYPE "TaxReformTaxType" AS ENUM (
  'IBS',
  'CBS',
  'IS'
);

CREATE TYPE "TaxJurisdictionScope" AS ENUM (
  'FEDERAL',
  'STATE',
  'MUNICIPAL'
);

ALTER TYPE "SefazEvent" ADD VALUE IF NOT EXISTS 'SOLICITACAO_APROPRIACAO_CREDITO';
ALTER TYPE "SefazEvent" ADD VALUE IF NOT EXISTS 'DESTINACAO_CONSUMO_PESSOAL';

ALTER TABLE "invoices"
  ADD COLUMN "finNFe" VARCHAR(1) NOT NULL DEFAULT '1',
  ADD COLUMN "issuePurpose" "NFeIssuePurpose" NOT NULL DEFAULT 'NORMAL',
  ADD COLUMN "cstCode" VARCHAR(3),
  ADD COLUMN "cClassTribCode" VARCHAR(6),
  ADD COLUMN "destinationStateIbge" VARCHAR(2),
  ADD COLUMN "destinationMunicipalityIbge" VARCHAR(7),
  ADD COLUMN "hasLegacyTaxes" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN "taxReformPayload" JSONB;

ALTER TABLE "invoice_sefaz_events"
  ADD COLUMN "protocolLength" INTEGER;

CREATE TABLE "tax_classifications" (
  "id" TEXT NOT NULL,
  "cstCode" VARCHAR(3) NOT NULL,
  "cClassTribCode" VARCHAR(6) NOT NULL,
  "description" TEXT NOT NULL,
  "taxType" "TaxReformTaxType" NOT NULL,
  "isZeroRate" BOOLEAN NOT NULL DEFAULT false,
  "reductionRate" DECIMAL(9,6) NOT NULL DEFAULT 0,
  "creditAllowed" BOOLEAN NOT NULL DEFAULT true,
  "legalBasis" TEXT,
  "sourceVersion" TEXT NOT NULL DEFAULT 'NT_2025_002',
  "validFrom" TIMESTAMP(3) NOT NULL,
  "validTo" TIMESTAMP(3),
  "active" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "tax_classifications_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "tax_reform_rates" (
  "id" TEXT NOT NULL,
  "companyId" TEXT,
  "taxType" "TaxReformTaxType" NOT NULL,
  "scope" "TaxJurisdictionScope" NOT NULL,
  "jurisdictionCode" VARCHAR(7),
  "cstCode" VARCHAR(3),
  "cClassTribCode" VARCHAR(6),
  "classificationId" TEXT,
  "rate" DECIMAL(9,6) NOT NULL,
  "reductionRate" DECIMAL(9,6) NOT NULL DEFAULT 0,
  "creditRate" DECIMAL(9,6),
  "validFrom" TIMESTAMP(3) NOT NULL,
  "validTo" TIMESTAMP(3),
  "sourceVersion" TEXT NOT NULL DEFAULT 'NT_2025_002',
  "legalBasis" TEXT,
  "active" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "tax_reform_rates_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "tax_destination_rules" (
  "id" TEXT NOT NULL,
  "companyId" TEXT,
  "originStateIbge" VARCHAR(2),
  "destinationStateIbge" VARCHAR(2) NOT NULL,
  "destinationMunicipalityIbge" VARCHAR(7),
  "cstCode" VARCHAR(3),
  "cClassTribCode" VARCHAR(6),
  "appliesIbs" BOOLEAN NOT NULL DEFAULT true,
  "appliesCbs" BOOLEAN NOT NULL DEFAULT true,
  "appliesSelectiveTax" BOOLEAN NOT NULL DEFAULT false,
  "priority" INTEGER NOT NULL DEFAULT 100,
  "validFrom" TIMESTAMP(3) NOT NULL,
  "validTo" TIMESTAMP(3),
  "sourceVersion" TEXT NOT NULL DEFAULT 'NT_2025_002',
  "legalBasis" TEXT,
  "active" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "tax_destination_rules_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "tax_classifications_cstCode_cClassTribCode_taxType_validFrom_key"
  ON "tax_classifications"("cstCode", "cClassTribCode", "taxType", "validFrom");
CREATE INDEX "tax_classifications_cstCode_cClassTribCode_idx"
  ON "tax_classifications"("cstCode", "cClassTribCode");
CREATE INDEX "tax_classifications_taxType_active_idx"
  ON "tax_classifications"("taxType", "active");

CREATE INDEX "tax_reform_rates_taxType_scope_jurisdictionCode_idx"
  ON "tax_reform_rates"("taxType", "scope", "jurisdictionCode");
CREATE INDEX "tax_reform_rates_cstCode_cClassTribCode_idx"
  ON "tax_reform_rates"("cstCode", "cClassTribCode");
CREATE INDEX "tax_reform_rates_validFrom_validTo_idx"
  ON "tax_reform_rates"("validFrom", "validTo");

CREATE INDEX "tax_destination_rules_destinationStateIbge_destinationMunicipalityIbge_idx"
  ON "tax_destination_rules"("destinationStateIbge", "destinationMunicipalityIbge");
CREATE INDEX "tax_destination_rules_cstCode_cClassTribCode_idx"
  ON "tax_destination_rules"("cstCode", "cClassTribCode");
CREATE INDEX "tax_destination_rules_validFrom_validTo_idx"
  ON "tax_destination_rules"("validFrom", "validTo");

CREATE INDEX "invoices_companyId_cstCode_cClassTribCode_idx"
  ON "invoices"("companyId", "cstCode", "cClassTribCode");
CREATE INDEX "invoices_destinationStateIbge_destinationMunicipalityIbge_idx"
  ON "invoices"("destinationStateIbge", "destinationMunicipalityIbge");

ALTER TABLE "tax_reform_rates"
  ADD CONSTRAINT "tax_reform_rates_classificationId_fkey"
  FOREIGN KEY ("classificationId") REFERENCES "tax_classifications"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "tax_reform_rates"
  ADD CONSTRAINT "tax_reform_rates_companyId_fkey"
  FOREIGN KEY ("companyId") REFERENCES "companies"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "tax_destination_rules"
  ADD CONSTRAINT "tax_destination_rules_companyId_fkey"
  FOREIGN KEY ("companyId") REFERENCES "companies"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

