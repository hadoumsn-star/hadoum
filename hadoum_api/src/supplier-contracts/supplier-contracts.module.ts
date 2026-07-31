import { Module } from '@nestjs/common';
import { UploadModule } from '../upload/upload.module';
import { ValidationsModule } from '../validations/validations.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { SupplierContractsController } from './supplier-contracts.controller';
import { SupplierContractsService } from './supplier-contracts.service';

@Module({
  imports: [UploadModule, ValidationsModule, NotificationsModule],
  controllers: [SupplierContractsController],
  providers: [SupplierContractsService],
})
export class SupplierContractsModule {}
