import { Module } from '@nestjs/common';
import { ValidationsModule } from '../validations/validations.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { ActivitiesController } from './activities.controller';
import { ActivitiesService } from './activities.service';

@Module({
  imports: [ValidationsModule, NotificationsModule],
  controllers: [ActivitiesController],
  providers: [ActivitiesService],
})
export class ActivitiesModule {}
