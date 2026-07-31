import { Module } from '@nestjs/common';
import { UploadModule } from '../upload/upload.module';
import { ValidationsModule } from '../validations/validations.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { StockMovementsModule } from '../stock-movements/stock-movements.module';
import { StockItemsController } from './stock-items.controller';
import { StockItemsService } from './stock-items.service';

@Module({
  imports: [
    UploadModule,
    ValidationsModule,
    NotificationsModule,
    StockMovementsModule,
  ],
  controllers: [StockItemsController],
  providers: [StockItemsService],
})
export class StockItemsModule {}
