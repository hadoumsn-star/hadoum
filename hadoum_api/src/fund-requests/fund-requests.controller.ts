import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ValidationStatus } from '@prisma/client';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { AuthUser } from '../auth/types/request-with-user';
import { FundRequestsService } from './fund-requests.service';
import { CreateFundRequestDto } from './dto/create-fund-request.dto';
import { ReviewValidationDto } from './dto/review-validation.dto';
import { RejectValidationDto } from './dto/reject-validation.dto';

@Controller('fund-requests')
@UseGuards(JwtAuthGuard, RolesGuard)
export class FundRequestsController {
  constructor(private readonly fundRequestsService: FundRequestsService) {}

  @Post()
  @Roles('DIRECTOR')
  create(@Body() dto: CreateFundRequestDto, @CurrentUser() user: AuthUser) {
    return this.fundRequestsService.create(dto, user.id);
  }

  @Get()
  @Roles('DIRECTOR', 'SUPERVISOR')
  findAll(@Query('validationStatus') validationStatus?: ValidationStatus) {
    return this.fundRequestsService.findAll(validationStatus);
  }

  @Get(':id')
  @Roles('DIRECTOR', 'SUPERVISOR')
  findOne(@Param('id') id: string) {
    return this.fundRequestsService.findOne(id);
  }

  @Patch(':id/approve')
  @Roles('SUPERVISOR')
  approve(
    @Param('id') id: string,
    @CurrentUser() user: AuthUser,
    @Body() dto: ReviewValidationDto,
  ) {
    return this.fundRequestsService.approve(id, user.id, dto);
  }

  @Patch(':id/reject')
  @Roles('SUPERVISOR')
  reject(
    @Param('id') id: string,
    @CurrentUser() user: AuthUser,
    @Body() dto: RejectValidationDto,
  ) {
    return this.fundRequestsService.reject(id, user.id, dto);
  }

  @Get(':id/validation-history')
  @Roles('DIRECTOR', 'SUPERVISOR')
  history(@Param('id') id: string) {
    return this.fundRequestsService.history(id);
  }
}
