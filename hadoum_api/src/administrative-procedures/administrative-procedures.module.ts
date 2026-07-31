import { Module } from '@nestjs/common';
import { UploadModule } from '../upload/upload.module';
import { ValidationsModule } from '../validations/validations.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { AdministrativeProceduresController } from './administrative-procedures.controller';
import { AdministrativeProceduresService } from './administrative-procedures.service';

@Module({
  imports: [UploadModule, ValidationsModule, NotificationsModule],
  controllers: [AdministrativeProceduresController],
  providers: [AdministrativeProceduresService],
})
export class AdministrativeProceduresModule {}
