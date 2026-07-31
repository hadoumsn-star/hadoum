import { Module } from '@nestjs/common';
import { FinancesController } from './finances.controller';
import { FinancesService } from './finances.service';
import { UploadModule } from '../upload/upload.module';

@Module({
  imports: [UploadModule],
  controllers: [FinancesController],
  providers: [FinancesService],
})
export class FinancesModule {}
