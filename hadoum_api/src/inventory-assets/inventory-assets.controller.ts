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
  AssetCondition,
  AssetStatus,
  StockCategory,
  ValidationStatus,
} from '@prisma/client';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { AuthUser } from '../auth/types/request-with-user';
import { InventoryAssetsService } from './inventory-assets.service';
import { CreateInventoryAssetDto } from './dto/create-inventory-asset.dto';
import { UpdateInventoryAssetDto } from './dto/update-inventory-asset.dto';
import { AssignInventoryAssetDto } from './dto/assign-inventory-asset.dto';
import { TransferInventoryAssetDto } from './dto/transfer-inventory-asset.dto';
import { RequestAssetDisposalDto } from './dto/request-asset-disposal.dto';
import { RequestArchiveDto } from './dto/request-archive.dto';
import { ReviewValidationDto } from './dto/review-validation.dto';
import { RejectValidationDto } from './dto/reject-validation.dto';

@Controller('inventory-assets')
@UseGuards(JwtAuthGuard, RolesGuard)
export class InventoryAssetsController {
  constructor(private readonly assetsService: InventoryAssetsService) {}

  @Post()
  @Roles('DIRECTOR')
  create(@Body() dto: CreateInventoryAssetDto, @CurrentUser() user: AuthUser) {
    return this.assetsService.create(dto, user.id);
  }

  @Get()
  @Roles('DIRECTOR', 'SUPERVISOR')
  findAll(
    @Query('search') search?: string,
    @Query('category') category?: StockCategory,
    @Query('condition') condition?: AssetCondition,
    @Query('status') status?: AssetStatus,
    @Query('spaceId') spaceId?: string,
    @Query('assignedTo') assignedTo?: string,
    @Query('warrantyExpiringSoon') warrantyExpiringSoon?: string,
    @Query('inventoryCheckDue') inventoryCheckDue?: string,
    @Query('archived') archived?: string,
    @Query('validationStatus') validationStatus?: ValidationStatus,
  ) {
    return this.assetsService.findAll({
      search,
      category,
      condition,
      status,
      spaceId,
      assignedTo,
      warrantyExpiringSoon: warrantyExpiringSoon === 'true',
      inventoryCheckDue: inventoryCheckDue === 'true',
      archived: archived === 'true',
      validationStatus,
    });
  }

  @Get(':id')
  @Roles('DIRECTOR', 'SUPERVISOR')
  findOne(@Param('id') id: string) {
    return this.assetsService.findOne(id);
  }

  @Patch(':id')
  @Roles('DIRECTOR')
  update(@Param('id') id: string, @Body() dto: UpdateInventoryAssetDto) {
    return this.assetsService.update(id, dto);
  }

  @Patch(':id/assign')
  @Roles('DIRECTOR')
  assign(@Param('id') id: string, @Body() dto: AssignInventoryAssetDto) {
    return this.assetsService.assign(id, dto);
  }

  @Patch(':id/transfer')
  @Roles('DIRECTOR')
  transfer(
    @Param('id') id: string,
    @CurrentUser() user: AuthUser,
    @Body() dto: TransferInventoryAssetDto,
  ) {
    return this.assetsService.transfer(id, user.id, dto);
  }

  @Post(':id/request-disposal')
  @Roles('DIRECTOR')
  requestDisposal(
    @Param('id') id: string,
    @CurrentUser() user: AuthUser,
    @Body() dto: RequestAssetDisposalDto,
  ) {
    return this.assetsService.requestDisposal(id, user.id, dto);
  }

  @Post(':id/request-archive')
  @Roles('DIRECTOR')
  requestArchive(
    @Param('id') id: string,
    @CurrentUser() user: AuthUser,
    @Body() dto: RequestArchiveDto,
  ) {
    return this.assetsService.requestArchive(id, user.id, dto);
  }

  @Patch(':id/approve')
  @Roles('SUPERVISOR')
  approve(
    @Param('id') id: string,
    @CurrentUser() user: AuthUser,
    @Body() dto: ReviewValidationDto,
  ) {
    return this.assetsService.approve(id, user.id, dto);
  }

  @Patch(':id/reject')
  @Roles('SUPERVISOR')
  reject(
    @Param('id') id: string,
    @CurrentUser() user: AuthUser,
    @Body() dto: RejectValidationDto,
  ) {
    return this.assetsService.reject(id, user.id, dto);
  }

  @Patch(':id/request-changes')
  @Roles('SUPERVISOR')
  requestChanges(
    @Param('id') id: string,
    @CurrentUser() user: AuthUser,
    @Body() dto: RejectValidationDto,
  ) {
    return this.assetsService.requestChanges(id, user.id, dto);
  }

  @Get(':id/validation-history')
  @Roles('DIRECTOR', 'SUPERVISOR')
  history(@Param('id') id: string) {
    return this.assetsService.history(id);
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
    return this.assetsService.uploadDocument(
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
    return this.assetsService.listDocuments(id);
  }

  @Get(':id/documents/:documentId/url')
  @Roles('DIRECTOR', 'SUPERVISOR')
  getDocumentUrl(
    @Param('id') id: string,
    @Param('documentId') documentId: string,
  ) {
    return this.assetsService.getDocumentUrl(id, documentId);
  }

  @Delete(':id/documents/:documentId')
  @Roles('DIRECTOR')
  deleteDocument(
    @Param('id') id: string,
    @Param('documentId') documentId: string,
  ) {
    return this.assetsService.deleteDocument(id, documentId);
  }
}
