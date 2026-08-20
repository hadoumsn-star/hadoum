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
import { CommunicationsService } from './communications.service';
import { CreateCommunicationDto } from './dto/create-communication.dto';
import { UpdateCommunicationDto } from './dto/update-communication.dto';
import { QueryCommunicationsDto } from './dto/query-communications.dto';

// PR 17 — DonorCommunication history. Same role split as every other
// Module 5 controller: BOARD absent entirely (no detailed communication
// access), SUPERVISOR read-only, DIRECTOR full read/write. No DELETE route
// exists — communication history is append-only.
@Controller('communications')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('DIRECTOR', 'SUPERVISOR')
export class CommunicationsController {
  constructor(private readonly communicationsService: CommunicationsService) {}

  @Get()
  findAll(@Query() query: QueryCommunicationsDto) {
    return this.communicationsService.findAll(query);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.communicationsService.findOne(id);
  }

  @Post()
  @Roles('DIRECTOR')
  @Audited({ module: 'DONORS', entity: 'DonorCommunication', action: 'CREATE' })
  create(@Body() dto: CreateCommunicationDto, @CurrentUser() user: AuthUser) {
    return this.communicationsService.create(dto, user.id);
  }

  @Patch(':id')
  @Roles('DIRECTOR')
  @Audited({ module: 'DONORS', entity: 'DonorCommunication', action: 'UPDATE' })
  update(@Param('id') id: string, @Body() dto: UpdateCommunicationDto) {
    return this.communicationsService.update(id, dto);
  }
}
