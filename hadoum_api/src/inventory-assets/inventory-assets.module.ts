import { Module } from '@nestjs/common';
import { UploadModule } from '../upload/upload.module';
import { ValidationsModule } from '../validations/validations.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { InventoryAssetsController } from './inventory-assets.controller';
import { InventoryAssetsService } from './inventory-assets.service';

@Module({
  imports: [UploadModule, ValidationsModule, NotificationsModule],
  controllers: [InventoryAssetsController],
  providers: [InventoryAssetsService],
})
export class InventoryAssetsModule {}
