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
import {
  EntryType,
  EntryStatus,
  ValidationStatus,
  VisitorCategory,
} from '@prisma/client';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { AuthUser } from '../auth/types/request-with-user';
import { EntryLogsService } from './entry-logs.service';
import { CreateEntryLogDto } from './dto/create-entry-log.dto';
import { UpdateEntryLogDto } from './dto/update-entry-log.dto';
import { CheckInEntryDto } from './dto/check-in-entry.dto';
import { CheckOutEntryDto } from './dto/check-out-entry.dto';
import { CancelEntryDto } from './dto/cancel-entry.dto';
import { RefuseEntryDto } from './dto/refuse-entry.dto';
import { ReviewValidationDto } from './dto/review-validation.dto';
import { RejectValidationDto } from './dto/reject-validation.dto';

@Controller('entry-logs')
@UseGuards(JwtAuthGuard, RolesGuard)
export class EntryLogsController {
  constructor(private readonly entryLogsService: EntryLogsService) {}

  @Post()
  @Roles('DIRECTOR')
  create(@Body() dto: CreateEntryLogDto, @CurrentUser() user: AuthUser) {
    return this.entryLogsService.create(dto, user.id);
  }

  @Get()
  @Roles('DIRECTOR', 'SUPERVISOR')
  findAll(
    @Query('search') search?: string,
    @Query('entryType') entryType?: EntryType,
    @Query('visitorCategory') visitorCategory?: VisitorCategory,
    @Query('status') status?: EntryStatus,
    @Query('currentlyPresent') currentlyPresent?: string,
    @Query('expectedVisit') expectedVisit?: string,
    @Query('overduePresence') overduePresence?: string,
    @Query('organization') organization?: string,
    @Query('personVisited') personVisited?: string,
    @Query('spaceId') spaceId?: string,
    @Query('incidentReported') incidentReported?: string,
    @Query('validationStatus') validationStatus?: ValidationStatus,
    @Query('dateFrom') dateFrom?: string,
    @Query('dateTo') dateTo?: string,
  ) {
    return this.entryLogsService.findAll({
      search,
      entryType,
      visitorCategory,
      status,
      currentlyPresent: currentlyPresent === 'true',
      expectedVisit: expectedVisit === 'true',
      overduePresence: overduePresence === 'true',
      organization,
      personVisited,
      spaceId,
      incidentReported:
        incidentReported === undefined
          ? undefined
          : incidentReported === 'true',
      validationStatus,
      dateFrom,
      dateTo,
    });
  }

  // Must be declared before ':id' so Nest doesn't treat these as an id param.
  @Get('current-presence')
  @Roles('DIRECTOR', 'SUPERVISOR')
  currentPresence() {
    return this.entryLogsService.currentPresence();
  }

  @Get('expected-visits')
  @Roles('DIRECTOR', 'SUPERVISOR')
  expectedVisits() {
    return this.entryLogsService.expectedVisits();
  }

  @Get(':id')
  @Roles('DIRECTOR', 'SUPERVISOR')
  findOne(@Param('id') id: string) {
    return this.entryLogsService.findOne(id);
  }

  @Patch(':id')
  @Roles('DIRECTOR')
  update(
    @Param('id') id: string,
    @CurrentUser() user: AuthUser,
    @Body() dto: UpdateEntryLogDto,
  ) {
    return this.entryLogsService.update(id, user.id, dto);
  }

  @Patch(':id/check-in')
  @Roles('DIRECTOR')
  checkIn(
    @Param('id') id: string,
    @CurrentUser() user: AuthUser,
    @Body() dto: CheckInEntryDto,
  ) {
    return this.entryLogsService.checkIn(id, user.id, dto);
  }

  @Patch(':id/check-out')
  @Roles('DIRECTOR')
  checkOut(
    @Param('id') id: string,
    @CurrentUser() user: AuthUser,
    @Body() dto: CheckOutEntryDto,
  ) {
    return this.entryLogsService.checkOut(id, user.id, dto);
  }

  @Patch(':id/cancel')
  @Roles('DIRECTOR')
  cancel(@Param('id') id: string, @Body() dto: CancelEntryDto) {
    return this.entryLogsService.cancel(id, dto);
  }

  @Patch(':id/refuse')
  @Roles('DIRECTOR')
  refuse(@Param('id') id: string, @Body() dto: RefuseEntryDto) {
    return this.entryLogsService.refuse(id, dto);
  }

  @Patch(':id/archive')
  @Roles('DIRECTOR')
  archive(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.entryLogsService.archive(id, user.id);
  }

  @Post(':id/submit-validation')
  @Roles('DIRECTOR')
  submitValidation(@Param('id') id: string) {
    return this.entryLogsService.submitValidation(id);
  }

  @Patch(':id/approve')
  @Roles('SUPERVISOR')
  approve(
    @Param('id') id: string,
    @CurrentUser() user: AuthUser,
    @Body() dto: ReviewValidationDto,
  ) {
    return this.entryLogsService.approve(id, user.id, dto);
  }

  @Patch(':id/reject')
  @Roles('SUPERVISOR')
  reject(
    @Param('id') id: string,
    @CurrentUser() user: AuthUser,
    @Body() dto: RejectValidationDto,
  ) {
    return this.entryLogsService.reject(id, user.id, dto);
  }

  @Patch(':id/request-changes')
  @Roles('SUPERVISOR')
  requestChanges(
    @Param('id') id: string,
    @CurrentUser() user: AuthUser,
    @Body() dto: RejectValidationDto,
  ) {
    return this.entryLogsService.requestChanges(id, user.id, dto);
  }

  @Get(':id/validation-history')
  @Roles('DIRECTOR', 'SUPERVISOR')
  history(@Param('id') id: string) {
    return this.entryLogsService.history(id);
  }

  @Post(':id/documents')
  @Roles('DIRECTOR')
  @UseInterceptors(
    FileInterceptor('file', { limits: { fileSize: 10 * 1024 * 1024 } }),
  )
  uploadDocument(
    @Param('id') id: string,
    @CurrentUser() user: AuthUser,
    @UploadedFile() file: Express.Multer.File,
    @Body('documentType') documentType?: string,
    @Body('label') label?: string,
  ) {
    return this.entryLogsService.uploadDocument(
      id,
      user.id,
      file,
      documentType,
      label,
    );
  }

  @Get(':id/documents')
  @Roles('DIRECTOR', 'SUPERVISOR')
  listDocuments(@Param('id') id: string) {
    return this.entryLogsService.listDocuments(id);
  }

  @Get(':id/documents/:documentId/url')
  @Roles('DIRECTOR', 'SUPERVISOR')
  getDocumentUrl(
    @Param('id') id: string,
    @Param('documentId') documentId: string,
  ) {
    return this.entryLogsService.getDocumentUrl(id, documentId);
  }

  @Delete(':id/documents/:documentId')
  @Roles('DIRECTOR')
  deleteDocument(
    @Param('id') id: string,
    @Param('documentId') documentId: string,
  ) {
    return this.entryLogsService.deleteDocument(id, documentId);
  }
}
