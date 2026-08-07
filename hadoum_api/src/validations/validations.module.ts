import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { ValidationsController } from './validations.controller';
import { ValidationsService } from './validations.service';

@Module({
  imports: [PrismaModule],
  controllers: [ValidationsController],
  providers: [ValidationsService],
  exports: [ValidationsService],
})
export class ValidationsModule {}
