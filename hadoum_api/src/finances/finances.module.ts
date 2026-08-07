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
})
export class FinancesModule {}
