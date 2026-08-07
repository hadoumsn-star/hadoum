import { Module } from '@nestjs/common';
import { UploadModule } from '../upload/upload.module';
import { ValidationsModule } from '../validations/validations.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { MaintenanceTicketsController } from './maintenance-tickets.controller';
import { MaintenanceTicketsService } from './maintenance-tickets.service';

@Module({
  imports: [UploadModule, ValidationsModule, NotificationsModule],
  controllers: [MaintenanceTicketsController],
  providers: [MaintenanceTicketsService],
})
export class MaintenanceTicketsModule {}
