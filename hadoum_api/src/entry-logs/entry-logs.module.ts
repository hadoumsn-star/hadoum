import { Module } from '@nestjs/common';
import { UploadModule } from '../upload/upload.module';
import { ValidationsModule } from '../validations/validations.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { EntryLogsController } from './entry-logs.controller';
import { EntryLogsService } from './entry-logs.service';

@Module({
  imports: [UploadModule, ValidationsModule, NotificationsModule],
  controllers: [EntryLogsController],
  providers: [EntryLogsService],
})
export class EntryLogsModule {}
