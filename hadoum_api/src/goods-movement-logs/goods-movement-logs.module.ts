import { Module } from '@nestjs/common';
import { UploadModule } from '../upload/upload.module';
import { ValidationsModule } from '../validations/validations.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { GoodsMovementLogsController } from './goods-movement-logs.controller';
import { GoodsMovementLogsService } from './goods-movement-logs.service';

@Module({
  imports: [UploadModule, ValidationsModule, NotificationsModule],
  controllers: [GoodsMovementLogsController],
  providers: [GoodsMovementLogsService],
})
export class GoodsMovementLogsModule {}
