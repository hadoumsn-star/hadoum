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
  ContractCategory,
  ContractStatus,
  ValidationStatus,
} from '@prisma/client';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { AuthUser } from '../auth/types/request-with-user';
import { Audited } from '../audit-logs/decorators/audited.decorator';
import { SupplierContractsService } from './supplier-contracts.service';
import { CreateSupplierContractDto } from './dto/create-supplier-contract.dto';
import { UpdateSupplierContractDto } from './dto/update-supplier-contract.dto';
import { SubmitValidationDto } from './dto/submit-validation.dto';
import { RequestRenewalDto } from './dto/request-renewal.dto';
import { RequestTerminationDto } from './dto/request-termination.dto';
import { ReviewValidationDto } from './dto/review-validation.dto';
import { RejectValidationDto } from './dto/reject-validation.dto';

@Controller('supplier-contracts')
@UseGuards(JwtAuthGuard, RolesGuard)
export class SupplierContractsController {
  constructor(private readonly contractsService: SupplierContractsService) {}

  @Post()
  @Roles('DIRECTOR')
  @Audited({
    module: 'SUPPLIER_CONTRACTS',
    entity: 'SupplierContract',
    action: 'CREATE',
  })
  create(@Body() dto: CreateSupplierContractDto, @CurrentUser() user: AuthUser) {
    return this.contractsService.create(dto, user.id);
  }

  @Get()
  @Roles('DIRECTOR', 'SUPERVISOR')
  findAll(
    @Query('category') category?: ContractCategory,
    @Query('status') status?: ContractStatus,
    @Query('validationStatus') validationStatus?: ValidationStatus,
    @Query('expiringSoon') expiringSoon?: string,
    @Query('expired') expired?: string,
    @Query('search') search?: string,
  ) {
    return this.contractsService.findAll({
      category,
      status,
      validationStatus,
      expiringSoon: expiringSoon === 'true',
      expired: expired === 'true',
      search,
    });
  }

  @Get(':id')
  @Roles('DIRECTOR', 'SUPERVISOR')
  findOne(@Param('id') id: string) {
    return this.contractsService.findOne(id);
  }

  @Patch(':id')
  @Roles('DIRECTOR')
  @Audited({
    module: 'SUPPLIER_CONTRACTS',
    entity: 'SupplierContract',
    action: 'UPDATE',
  })
  update(@Param('id') id: string, @Body() dto: UpdateSupplierContractDto) {
    return this.contractsService.update(id, dto);
  }

  @Patch(':id/archive')
  @Roles('DIRECTOR')
  @Audited({
    module: 'SUPPLIER_CONTRACTS',
    entity: 'SupplierContract',
    action: 'ARCHIVE',
  })
  archive(@Param('id') id: string) {
    return this.contractsService.archive(id);
  }

  @Post(':id/submit-validation')
  @Roles('DIRECTOR')
  @Audited({
    module: 'SUPPLIER_CONTRACTS',
    entity: 'SupplierContract',
    action: 'SUBMIT_VALIDATION',
  })
  submitValidation(
    @Param('id') id: string,
    @CurrentUser() user: AuthUser,
    @Body() dto: SubmitValidationDto,
  ) {
    return this.contractsService.submitValidation(id, user.id, dto);
  }

  @Post(':id/request-renewal')
  @Roles('DIRECTOR')
  @Audited({
    module: 'SUPPLIER_CONTRACTS',
    entity: 'SupplierContract',
    action: 'REQUEST_RENEWAL',
  })
  requestRenewal(
    @Param('id') id: string,
    @CurrentUser() user: AuthUser,
    @Body() dto: RequestRenewalDto,
  ) {
    return this.contractsService.requestRenewal(id, user.id, dto);
  }

  @Post(':id/request-termination')
  @Roles('DIRECTOR')
  @Audited({
    module: 'SUPPLIER_CONTRACTS',
    entity: 'SupplierContract',
    action: 'REQUEST_TERMINATION',
  })
  requestTermination(
    @Param('id') id: string,
    @CurrentUser() user: AuthUser,
    @Body() dto: RequestTerminationDto,
  ) {
    return this.contractsService.requestTermination(id, user.id, dto);
  }

  @Patch(':id/approve')
  @Roles('SUPERVISOR')
  @Audited({
    module: 'SUPPLIER_CONTRACTS',
    entity: 'SupplierContract',
    action: 'APPROVE',
  })
  approve(
    @Param('id') id: string,
    @CurrentUser() user: AuthUser,
    @Body() dto: ReviewValidationDto,
  ) {
    return this.contractsService.approve(id, user.id, dto);
  }

  @Patch(':id/reject')
  @Roles('SUPERVISOR')
  @Audited({
    module: 'SUPPLIER_CONTRACTS',
    entity: 'SupplierContract',
    action: 'REJECT',
  })
  reject(
    @Param('id') id: string,
    @CurrentUser() user: AuthUser,
    @Body() dto: RejectValidationDto,
  ) {
    return this.contractsService.reject(id, user.id, dto);
  }

  @Patch(':id/request-changes')
  @Roles('SUPERVISOR')
  @Audited({
    module: 'SUPPLIER_CONTRACTS',
    entity: 'SupplierContract',
    action: 'REQUEST_CHANGES',
  })
  requestChanges(
    @Param('id') id: string,
    @CurrentUser() user: AuthUser,
    @Body() dto: RejectValidationDto,
  ) {
    return this.contractsService.requestChanges(id, user.id, dto);
  }

  @Get(':id/validation-history')
  @Roles('DIRECTOR', 'SUPERVISOR')
  history(@Param('id') id: string) {
    return this.contractsService.history(id);
  }

  @Post(':id/documents')
  @Roles('DIRECTOR')
  @UseInterceptors(
    FileInterceptor('file', { limits: { fileSize: 10 * 1024 * 1024 } }),
  )
  uploadDocument(
    @Param('id') id: string,
    @UploadedFile() file: Express.Multer.File,
    @Body('label') label?: string,
  ) {
    return this.contractsService.uploadDocument(id, file, label);
  }

  @Get(':id/documents')
  @Roles('DIRECTOR', 'SUPERVISOR')
  listDocuments(@Param('id') id: string) {
    return this.contractsService.listDocuments(id);
  }

  @Get(':id/documents/:documentId/url')
  @Roles('DIRECTOR', 'SUPERVISOR')
  getDocumentUrl(
    @Param('id') id: string,
    @Param('documentId') documentId: string,
  ) {
    return this.contractsService.getDocumentUrl(id, documentId);
  }

  @Delete(':id/documents/:documentId')
  @Roles('DIRECTOR')
  deleteDocument(
    @Param('id') id: string,
    @Param('documentId') documentId: string,
  ) {
    return this.contractsService.deleteDocument(id, documentId);
  }
}
