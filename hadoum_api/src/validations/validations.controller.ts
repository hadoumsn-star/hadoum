import { Controller, Get, Param, UseGuards } from '@nestjs/common';
import { ValidationResourceType } from '@prisma/client';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { ValidationsService } from './validations.service';

@Controller('validations')
@UseGuards(JwtAuthGuard, RolesGuard)
export class ValidationsController {
  constructor(private readonly validationsService: ValidationsService) {}

  @Get('pending')
  @Roles('DIRECTOR', 'SUPERVISOR')
  findPending() {
    return this.validationsService.findPending();
  }

  @Get(':resourceType/:resourceId/history')
  @Roles('DIRECTOR', 'SUPERVISOR')
  findHistory(
    @Param('resourceType') resourceType: ValidationResourceType,
    @Param('resourceId') resourceId: string,
  ) {
    return this.validationsService.findHistory(resourceType, resourceId);
  }
}
