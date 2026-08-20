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
import { DonorsService } from './donors.service';
import { CreateDonorProfileDto } from './dto/create-donor-profile.dto';
import { UpdateDonorProfileDto } from './dto/update-donor-profile.dto';
import { QueryDonorProfilesDto } from './dto/query-donor-profiles.dto';

// PR 15 — DonorProfile (Parrains / Donateurs ponctuels) only. No campaigns,
// donations, communications, or reports yet (see the approved PR 15 plan).
//
// BOARD is deliberately absent from every @Roles() below — the detailed
// donor registry (phone/email/payment-relevant fields) is DIRECTOR +
// SUPERVISOR only; BOARD's own synthetic view is a later PR. EDUCATOR is
// absent for the same reason every other admin/finance-adjacent module
// (Contacts, Finances) already excludes it.
@Controller('donors')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('DIRECTOR', 'SUPERVISOR')
export class DonorsController {
  constructor(private readonly donorsService: DonorsService) {}

  @Get()
  findAll(@Query() query: QueryDonorProfilesDto) {
    return this.donorsService.findAll(query);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.donorsService.findOne(id);
  }

  // Every route below overrides the class-level DIRECTOR+SUPERVISOR gate
  // to DIRECTOR only — ordinary donor-profile CRUD is operational, not
  // something SUPERVISOR co-manages (see the approved PR 15 plan). Same
  // per-method @Roles-override convention FinancesController already uses
  // for its own DIRECTOR-only/SUPERVISOR-only route splits.

  @Post()
  @Roles('DIRECTOR')
  @Audited({ module: 'DONORS', entity: 'DonorProfile', action: 'CREATE' })
  create(@Body() dto: CreateDonorProfileDto, @CurrentUser() user: AuthUser) {
    return this.donorsService.create(dto, user.id);
  }

  @Patch(':id')
  @Roles('DIRECTOR')
  @Audited({ module: 'DONORS', entity: 'DonorProfile', action: 'UPDATE' })
  update(@Param('id') id: string, @Body() dto: UpdateDonorProfileDto) {
    return this.donorsService.update(id, dto);
  }

  @Patch(':id/deactivate')
  @Roles('DIRECTOR')
  @Audited({ module: 'DONORS', entity: 'DonorProfile', action: 'DEACTIVATE' })
  deactivate(@Param('id') id: string) {
    return this.donorsService.deactivate(id);
  }

  @Patch(':id/reactivate')
  @Roles('DIRECTOR')
  @Audited({ module: 'DONORS', entity: 'DonorProfile', action: 'REACTIVATE' })
  reactivate(@Param('id') id: string) {
    return this.donorsService.reactivate(id);
  }
}
