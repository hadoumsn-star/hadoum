-- CreateEnum
CREATE TYPE "ExpenseWorkflowStatus" AS ENUM ('PENDING_APPROVAL', 'APPROVED', 'REJECTED', 'COMPLETED', 'CANCELLED');

-- AlterTable
ALTER TABLE "Transaction" ADD COLUMN     "expenseWorkflowStatus" "ExpenseWorkflowStatus";

-- CreateIndex
CREATE INDEX "Transaction_expenseWorkflowStatus_idx" ON "Transaction"("expenseWorkflowStatus");
