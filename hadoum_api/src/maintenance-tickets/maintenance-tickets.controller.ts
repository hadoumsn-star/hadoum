import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { TicketStatus, TicketUrgency, ValidationStatus } from '@prisma/client';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { AuthUser } from '../auth/types/request-with-user';
import { Audited } from '../audit-logs/decorators/audited.decorator';
import { MaintenanceTicketsService } from './maintenance-tickets.service';
import { CreateMaintenanceTicketDto } from './dto/create-maintenance-ticket.dto';
import { UpdateMaintenanceTicketDto } from './dto/update-maintenance-ticket.dto';
import { AssignTicketDto } from './dto/assign-ticket.dto';
import { SubmitValidationDto } from './dto/submit-validation.dto';
import { ReviewValidationDto } from './dto/review-validation.dto';
import { RejectValidationDto } from './dto/reject-validation.dto';

@Controller('maintenance-tickets')
@UseGuards(JwtAuthGuard, RolesGuard)
export class MaintenanceTicketsController {
  constructor(private readonly ticketsService: MaintenanceTicketsService) {}

  @Post()
  @Roles('DIRECTOR')
  @Audited({
    module: 'MAINTENANCE',
    entity: 'MaintenanceTicket',
    action: 'CREATE',
  })
  create(@Body() dto: CreateMaintenanceTicketDto) {
    return this.ticketsService.create(dto);
  }

  @Get()
  @Roles('DIRECTOR', 'SUPERVISOR')
  findAll(
    @Query('spaceId') spaceId?: string,
    @Query('status') status?: TicketStatus,
    @Query('urgency') urgency?: TicketUrgency,
    @Query('validationStatus') validationStatus?: ValidationStatus,
    @Query('search') search?: string,
  ) {
    return this.ticketsService.findAll({
      spaceId,
      status,
      urgency,
      validationStatus,
      search,
    });
  }

  @Get(':id')
  @Roles('DIRECTOR', 'SUPERVISOR')
  findOne(@Param('id') id: string) {
    return this.ticketsService.findOne(id);
  }

  @Patch(':id')
  @Roles('DIRECTOR')
  @Audited({
    module: 'MAINTENANCE',
    entity: 'MaintenanceTicket',
    action: 'UPDATE',
  })
  update(@Param('id') id: string, @Body() dto: UpdateMaintenanceTicketDto) {
    return this.ticketsService.update(id, dto);
  }

  @Patch(':id/assign')
  @Roles('DIRECTOR')
  @Audited({
    module: 'MAINTENANCE',
    entity: 'MaintenanceTicket',
    action: 'ASSIGN',
  })
  assign(@Param('id') id: string, @Body() dto: AssignTicketDto) {
    return this.ticketsService.assign(id, dto);
  }

  @Patch(':id/close')
  @Roles('DIRECTOR')
  @Audited({
    module: 'MAINTENANCE',
    entity: 'MaintenanceTicket',
    action: 'CLOSE',
  })
  close(@Param('id') id: string) {
    return this.ticketsService.close(id);
  }

  @Post(':id/submit-validation')
  @Roles('DIRECTOR')
  @Audited({
    module: 'MAINTENANCE',
    entity: 'MaintenanceTicket',
    action: 'SUBMIT_VALIDATION',
  })
  submitValidation(
    @Param('id') id: string,
    @CurrentUser() user: AuthUser,
    @Body() dto: SubmitValidationDto,
  ) {
    return this.ticketsService.submitValidation(id, user.id, dto);
  }

  @Patch(':id/approve')
  @Roles('SUPERVISOR')
  @Audited({
    module: 'MAINTENANCE',
    entity: 'MaintenanceTicket',
    action: 'APPROVE',
  })
  approve(
    @Param('id') id: string,
    @CurrentUser() user: AuthUser,
    @Body() dto: ReviewValidationDto,
  ) {
    return this.ticketsService.approve(id, user.id, dto);
  }

  @Patch(':id/reject')
  @Roles('SUPERVISOR')
  @Audited({
    module: 'MAINTENANCE',
    entity: 'MaintenanceTicket',
    action: 'REJECT',
  })
  reject(
    @Param('id') id: string,
    @CurrentUser() user: AuthUser,
    @Body() dto: RejectValidationDto,
  ) {
    return this.ticketsService.reject(id, user.id, dto);
  }

  @Patch(':id/request-changes')
  @Roles('SUPERVISOR')
  @Audited({
    module: 'MAINTENANCE',
    entity: 'MaintenanceTicket',
    action: 'REQUEST_CHANGES',
  })
  requestChanges(
    @Param('id') id: string,
    @CurrentUser() user: AuthUser,
    @Body() dto: RejectValidationDto,
  ) {
    return this.ticketsService.requestChanges(id, user.id, dto);
  }

  @Get(':id/validation-history')
  @Roles('DIRECTOR', 'SUPERVISOR')
  history(@Param('id') id: string) {
    return this.ticketsService.history(id);
  }

  @Post(':id/attachments')
  @Roles('DIRECTOR')
  @UseInterceptors(
    FileInterceptor('file', { limits: { fileSize: 10 * 1024 * 1024 } }),
  )
  uploadAttachment(
    @Param('id') id: string,
    @UploadedFile() file: Express.Multer.File,
  ) {
    return this.ticketsService.uploadAttachment(id, file);
  }

  @Get(':id/attachments')
  @Roles('DIRECTOR', 'SUPERVISOR')
  listAttachments(@Param('id') id: string) {
    return this.ticketsService.listAttachments(id);
  }

  @Get(':id/attachments/:attachmentId/url')
  @Roles('DIRECTOR', 'SUPERVISOR')
  getAttachmentUrl(
    @Param('id') id: string,
    @Param('attachmentId') attachmentId: string,
  ) {
    return this.ticketsService.getAttachmentUrl(id, attachmentId);
  }

  @Delete(':id/attachments/:attachmentId')
  @Roles('DIRECTOR')
  deleteAttachment(
    @Param('id') id: string,
    @Param('attachmentId') attachmentId: string,
  ) {
    return this.ticketsService.deleteAttachment(id, attachmentId);
  }
}
