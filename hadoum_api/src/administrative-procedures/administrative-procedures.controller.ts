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
  ProcedurePriority,
  ProcedureStatus,
  ProcedureType,
  ProcedureDocumentType,
  ValidationStatus,
} from '@prisma/client';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { AuthUser } from '../auth/types/request-with-user';
import { Audited } from '../audit-logs/decorators/audited.decorator';
import { AdministrativeProceduresService } from './administrative-procedures.service';
import { CreateAdministrativeProcedureDto } from './dto/create-administrative-procedure.dto';
import { UpdateAdministrativeProcedureDto } from './dto/update-administrative-procedure.dto';
import { SubmitValidationDto } from './dto/submit-validation.dto';
import { RequestRenewalDto } from './dto/request-renewal.dto';
import { RequestArchiveDto } from './dto/request-archive.dto';
import { ReviewValidationDto } from './dto/review-validation.dto';
import { RejectValidationDto } from './dto/reject-validation.dto';

@Controller('administrative-procedures')
@UseGuards(JwtAuthGuard, RolesGuard)
export class AdministrativeProceduresController {
  constructor(
    private readonly proceduresService: AdministrativeProceduresService,
  ) {}

  @Post()
  @Roles('DIRECTOR')
  @Audited({
    module: 'ADMINISTRATIVE_PROCEDURES',
    entity: 'AdministrativeProcedure',
    action: 'CREATE',
  })
  create(
    @Body() dto: CreateAdministrativeProcedureDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.proceduresService.create(dto, user.id);
  }

  @Get()
  @Roles('DIRECTOR', 'SUPERVISOR')
  findAll(
    @Query('search') search?: string,
    @Query('procedureType') procedureType?: ProcedureType,
    @Query('authority') authority?: string,
    @Query('status') status?: ProcedureStatus,
    @Query('priority') priority?: ProcedurePriority,
    @Query('validationStatus') validationStatus?: ValidationStatus,
    @Query('assignedTo') assignedTo?: string,
    @Query('expiringSoon') expiringSoon?: string,
    @Query('expired') expired?: string,
    @Query('renewalDueSoon') renewalDueSoon?: string,
    @Query('responseOverdue') responseOverdue?: string,
    @Query('dateFrom') dateFrom?: string,
    @Query('dateTo') dateTo?: string,
  ) {
    return this.proceduresService.findAll({
      search,
      procedureType,
      authority,
      status,
      priority,
      validationStatus,
      assignedTo,
      expiringSoon: expiringSoon === 'true',
      expired: expired === 'true',
      renewalDueSoon: renewalDueSoon === 'true',
      responseOverdue: responseOverdue === 'true',
      dateFrom,
      dateTo,
    });
  }

  @Get(':id')
  @Roles('DIRECTOR', 'SUPERVISOR')
  findOne(@Param('id') id: string) {
    return this.proceduresService.findOne(id);
  }

  @Patch(':id')
  @Roles('DIRECTOR')
  @Audited({
    module: 'ADMINISTRATIVE_PROCEDURES',
    entity: 'AdministrativeProcedure',
    action: 'UPDATE',
  })
  update(
    @Param('id') id: string,
    @Body() dto: UpdateAdministrativeProcedureDto,
  ) {
    return this.proceduresService.update(id, dto);
  }

  @Patch(':id/archive')
  @Roles('DIRECTOR')
  @Audited({
    module: 'ADMINISTRATIVE_PROCEDURES',
    entity: 'AdministrativeProcedure',
    action: 'ARCHIVE',
  })
  archive(@Param('id') id: string) {
    return this.proceduresService.archive(id);
  }

  @Post(':id/submit-validation')
  @Roles('DIRECTOR')
  @Audited({
    module: 'ADMINISTRATIVE_PROCEDURES',
    entity: 'AdministrativeProcedure',
    action: 'SUBMIT_VALIDATION',
  })
  submitValidation(
    @Param('id') id: string,
    @CurrentUser() user: AuthUser,
    @Body() dto: SubmitValidationDto,
  ) {
    return this.proceduresService.submitValidation(id, user.id, dto);
  }

  @Post(':id/request-renewal')
  @Roles('DIRECTOR')
  @Audited({
    module: 'ADMINISTRATIVE_PROCEDURES',
    entity: 'AdministrativeProcedure',
    action: 'REQUEST_RENEWAL',
  })
  requestRenewal(
    @Param('id') id: string,
    @CurrentUser() user: AuthUser,
    @Body() dto: RequestRenewalDto,
  ) {
    return this.proceduresService.requestRenewal(id, user.id, dto);
  }

  @Post(':id/request-archive')
  @Roles('DIRECTOR')
  @Audited({
    module: 'ADMINISTRATIVE_PROCEDURES',
    entity: 'AdministrativeProcedure',
    action: 'REQUEST_ARCHIVE',
  })
  requestArchive(
    @Param('id') id: string,
    @CurrentUser() user: AuthUser,
    @Body() dto: RequestArchiveDto,
  ) {
    return this.proceduresService.requestArchive(id, user.id, dto);
  }

  @Patch(':id/approve')
  @Roles('SUPERVISOR')
  @Audited({
    module: 'ADMINISTRATIVE_PROCEDURES',
    entity: 'AdministrativeProcedure',
    action: 'APPROVE',
  })
  approve(
    @Param('id') id: string,
    @CurrentUser() user: AuthUser,
    @Body() dto: ReviewValidationDto,
  ) {
    return this.proceduresService.approve(id, user.id, dto);
  }

  @Patch(':id/reject')
  @Roles('SUPERVISOR')
  @Audited({
    module: 'ADMINISTRATIVE_PROCEDURES',
    entity: 'AdministrativeProcedure',
    action: 'REJECT',
  })
  reject(
    @Param('id') id: string,
    @CurrentUser() user: AuthUser,
    @Body() dto: RejectValidationDto,
  ) {
    return this.proceduresService.reject(id, user.id, dto);
  }

  @Patch(':id/request-changes')
  @Roles('SUPERVISOR')
  @Audited({
    module: 'ADMINISTRATIVE_PROCEDURES',
    entity: 'AdministrativeProcedure',
    action: 'REQUEST_CHANGES',
  })
  requestChanges(
    @Param('id') id: string,
    @CurrentUser() user: AuthUser,
    @Body() dto: RejectValidationDto,
  ) {
    return this.proceduresService.requestChanges(id, user.id, dto);
  }

  @Get(':id/validation-history')
  @Roles('DIRECTOR', 'SUPERVISOR')
  history(@Param('id') id: string) {
    return this.proceduresService.history(id);
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
    @Body('documentType') documentType?: ProcedureDocumentType,
    @Body('label') label?: string,
  ) {
    return this.proceduresService.uploadDocument(
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
    return this.proceduresService.listDocuments(id);
  }

  @Get(':id/documents/:documentId/url')
  @Roles('DIRECTOR', 'SUPERVISOR')
  getDocumentUrl(
    @Param('id') id: string,
    @Param('documentId') documentId: string,
  ) {
    return this.proceduresService.getDocumentUrl(id, documentId);
  }

  @Delete(':id/documents/:documentId')
  @Roles('DIRECTOR')
  deleteDocument(
    @Param('id') id: string,
    @Param('documentId') documentId: string,
  ) {
    return this.proceduresService.deleteDocument(id, documentId);
  }
}
