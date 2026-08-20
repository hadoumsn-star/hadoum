import { Module } from '@nestjs/common';
import { FinancesController } from './finances.controller';
import { FinancesService } from './finances.service';
import { ExpenseWorkflowService } from './expense-workflow.service';
import { BudgetService } from './budget.service';
import { UploadModule } from '../upload/upload.module';
import { ValidationsModule } from '../validations/validations.module';
import { NotificationsModule } from '../notifications/notifications.module';

@Module({
  imports: [UploadModule, ValidationsModule, NotificationsModule],
  controllers: [FinancesController],
  providers: [FinancesService, ExpenseWorkflowService, BudgetService],
  // PR 16 (Module 5): DonorsModule reuses FinancesService.createTransaction()
  // to record a donation's Finance RECETTE/DON transaction, rather than
  // reimplementing that logic — see DonationsService. Nothing in this
  // module's own behavior changes.
  exports: [FinancesService],
})
export class FinancesModule {}
