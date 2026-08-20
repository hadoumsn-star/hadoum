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
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { AuthUser } from '../auth/types/request-with-user';
import { Audited } from '../audit-logs/decorators/audited.decorator';
import { DonationsService } from './donations.service';
import { CreateDonationDto } from './dto/create-donation.dto';
import { UpdateDonationDto } from './dto/update-donation.dto';
import { QueryDonationsDto } from './dto/query-donations.dto';

// PR 16 — Donation recording + history. BOARD is absent from every
// @Roles() below, same reasoning as DonorsController/CampaignsController:
// financial donor history is DIRECTOR + SUPERVISOR oversight only. No
// DELETE route exists anywhere in this controller — hard-deleting a
// recorded donation is out of scope for PR 16 (see the PR 16 report's
// "Donation mutation policy" section).
@Controller('donations')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('DIRECTOR', 'SUPERVISOR')
export class DonationsController {
  constructor(private readonly donationsService: DonationsService) {}

  @Get()
  findAll(@Query() query: QueryDonationsDto) {
    return this.donationsService.findAll(query);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.donationsService.findOne(id);
  }

  @Post()
  @Roles('DIRECTOR')
  @Audited({ module: 'DONORS', entity: 'Donation', action: 'CREATE' })
  create(@Body() dto: CreateDonationDto, @CurrentUser() user: AuthUser) {
    return this.donationsService.create(dto, user.id);
  }

  @Patch(':id')
  @Roles('DIRECTOR')
  @Audited({ module: 'DONORS', entity: 'Donation', action: 'UPDATE' })
  update(@Param('id') id: string, @Body() dto: UpdateDonationDto) {
    return this.donationsService.update(id, dto);
  }
}
