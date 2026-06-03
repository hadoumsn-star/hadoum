-- Add complementary document types for psychomotor evaluation, psychosomatic report, and health report
ALTER TYPE "DocumentType" ADD VALUE 'EVALUATION_PSYCHOMOTRICE';
ALTER TYPE "DocumentType" ADD VALUE 'BILAN_PSYCHOSOMATIQUE';
ALTER TYPE "DocumentType" ADD VALUE 'BILAN_SANTE';
