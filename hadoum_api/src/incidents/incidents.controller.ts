import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  Query,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { IncidentPriority, IncidentStatus, IncidentType } from '@prisma/client';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { AuthUser } from '../auth/types/request-with-user';
import { Audited } from '../audit-logs/decorators/audited.decorator';
import { IncidentsService } from './incidents.service';
import { CreateIncidentDto } from './dto/create-incident.dto';
import { UpdateIncidentDto } from './dto/update-incident.dto';
import { ChangeIncidentStatusDto } from './dto/change-incident-status.dto';

@Controller('incidents')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('DIRECTOR', 'SUPERVISOR')
export class IncidentsController {
  constructor(private readonly incidentsService: IncidentsService) {}

  // DIRECTOR and SUPERVISOR can both create — see class-level @Roles.
  @Post()
  @Audited({ module: 'INCIDENTS', entity: 'Incident', action: 'CREATE' })
  create(@Body() dto: CreateIncidentDto, @CurrentUser() user: AuthUser) {
    return this.incidentsService.create(dto, user.id);
  }

  @Get()
  findAll(
    @Query('status') status?: IncidentStatus,
    @Query('priority') priority?: IncidentPriority,
    @Query('type') type?: IncidentType,
    @Query('childId') childId?: string,
    @Query('staffId') staffId?: string,
    @Query('spaceId') spaceId?: string,
    @Query('search') search?: string,
  ) {
    return this.incidentsService.findAll({
      status,
      priority,
      type,
      childId,
      staffId,
      spaceId,
      search,
    });
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.incidentsService.findOne(id);
  }

  // Edit — DIRECTOR only. SUPERVISOR may create but never edit afterwards.
  @Patch(':id')
  @Roles('DIRECTOR')
  @Audited({ module: 'INCIDENTS', entity: 'Incident', action: 'UPDATE' })
  update(@Param('id') id: string, @Body() dto: UpdateIncidentDto) {
    return this.incidentsService.update(id, dto);
  }

  // Status changes (including resolving) — DIRECTOR only, note mandatory.
  @Patch(':id/status')
  @Roles('DIRECTOR')
  @Audited({ module: 'INCIDENTS', entity: 'Incident', action: 'STATUS_CHANGE' })
  changeStatus(
    @Param('id') id: string,
    @Body() dto: ChangeIncidentStatusDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.incidentsService.changeStatus(id, dto, user.id);
  }

  @Delete(':id')
  @Roles('DIRECTOR')
  @HttpCode(204)
  @Audited({ module: 'INCIDENTS', entity: 'Incident', action: 'DELETE' })
  delete(@Param('id') id: string) {
    return this.incidentsService.delete(id);
  }

  @Post(':id/attachment')
  @UseInterceptors(
    FileInterceptor('file', { limits: { fileSize: 10 * 1024 * 1024 } }),
  )
  uploadAttachment(
    @Param('id') id: string,
    @UploadedFile() file: Express.Multer.File,
  ) {
    return this.incidentsService.uploadAttachment(id, file);
  }

  @Get(':id/attachment-url')
  getAttachmentUrl(@Param('id') id: string) {
    return this.incidentsService.getAttachmentUrl(id);
  }
}
