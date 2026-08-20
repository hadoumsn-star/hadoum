import { Module } from '@nestjs/common';
import { StaffController } from './staff.controller';
import { StaffService } from './staff.service';
import { UploadModule } from '../upload/upload.module';

@Module({
  imports: [UploadModule],
  controllers: [StaffController],
  providers: [StaffService],
  // Module 6 (PR 20) — DashboardModule reuses StaffService.
  // listDailyPresence() (present/absent/non-confirmed) rather than
  // re-deriving that aggregation; StaffService was not previously
  // exported because no other module needed it before now. Minimal,
  // additive change — nothing about StaffModule's own behavior changes.
  exports: [StaffService],
})
export class StaffModule {}
