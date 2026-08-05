import { Module } from '@nestjs/common';
import { ValidationsModule } from '../validations/validations.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { FundRequestsController } from './fund-requests.controller';
import { FundRequestsService } from './fund-requests.service';

@Module({
  imports: [ValidationsModule, NotificationsModule],
  controllers: [FundRequestsController],
  providers: [FundRequestsService],
})
export class FundRequestsModule {}
