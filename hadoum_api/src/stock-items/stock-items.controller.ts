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
import { StockCategory, StockUnit, ValidationStatus } from '@prisma/client';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { AuthUser } from '../auth/types/request-with-user';
import { Audited } from '../audit-logs/decorators/audited.decorator';
import { StockItemsService } from './stock-items.service';
import { CreateStockItemDto } from './dto/create-stock-item.dto';
import { UpdateStockItemDto } from './dto/update-stock-item.dto';
import { CreateStockEntryDto } from './dto/create-stock-entry.dto';
import { CreateStockExitDto } from './dto/create-stock-exit.dto';
import { CreateStockAdjustmentDto } from './dto/create-stock-adjustment.dto';
import { CreateStockTransferDto } from './dto/create-stock-transfer.dto';
import { CreateStockInventoryCountDto } from './dto/create-stock-inventory-count.dto';
import { SubmitValidationDto } from './dto/submit-validation.dto';
import { ReviewValidationDto } from './dto/review-validation.dto';
import { RejectValidationDto } from './dto/reject-validation.dto';

@Controller('stock-items')
@UseGuards(JwtAuthGuard, RolesGuard)
export class StockItemsController {
  constructor(private readonly stockItemsService: StockItemsService) {}

  @Post()
  @Roles('DIRECTOR')
  @Audited({ module: 'STOCK', entity: 'StockItem', action: 'CREATE' })
  create(@Body() dto: CreateStockItemDto, @CurrentUser() user: AuthUser) {
    return this.stockItemsService.create(dto, user.id);
  }

  @Get()
  @Roles('DIRECTOR', 'SUPERVISOR')
  findAll(
    @Query('search') search?: string,
    @Query('category') category?: StockCategory,
    @Query('unit') unit?: StockUnit,
    @Query('active') active?: string,
    @Query('lowStock') lowStock?: string,
    @Query('outOfStock') outOfStock?: string,
    @Query('expiringSoon') expiringSoon?: string,
    @Query('expired') expired?: string,
    @Query('storageLocation') storageLocation?: string,
    @Query('spaceId') spaceId?: string,
    @Query('supplier') supplierName?: string,
    @Query('validationStatus') validationStatus?: ValidationStatus,
  ) {
    return this.stockItemsService.findAll({
      search,
      category,
      unit,
      active: active === undefined ? undefined : active === 'true',
      lowStock: lowStock === 'true',
      outOfStock: outOfStock === 'true',
      expiringSoon: expiringSoon === 'true',
      expired: expired === 'true',
      storageLocation,
      spaceId,
      supplierName,
      validationStatus,
    });
  }

  @Get(':id')
  @Roles('DIRECTOR', 'SUPERVISOR')
  findOne(@Param('id') id: string) {
    return this.stockItemsService.findOne(id);
  }

  @Patch(':id')
  @Roles('DIRECTOR')
  @Audited({ module: 'STOCK', entity: 'StockItem', action: 'UPDATE' })
  update(@Param('id') id: string, @Body() dto: UpdateStockItemDto) {
    return this.stockItemsService.update(id, dto);
  }

  @Patch(':id/archive')
  @Roles('DIRECTOR')
  @Audited({ module: 'STOCK', entity: 'StockItem', action: 'ARCHIVE' })
  archive(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.stockItemsService.archive(id, user.id);
  }

  // PR 12: SUPERVISOR can record entries/exits too (full access stays
  // DIRECTOR-only — see adjustments/transfers/archive below, unchanged).
  @Post(':id/entries')
  @Roles('DIRECTOR', 'SUPERVISOR')
  @Audited({ module: 'STOCK', entity: 'StockMovement', action: 'ENTRY' })
  createEntry(
    @Param('id') id: string,
    @CurrentUser() user: AuthUser,
    @Body() dto: CreateStockEntryDto,
  ) {
    return this.stockItemsService.createEntry(id, user.id, dto);
  }

  @Post(':id/exits')
  @Roles('DIRECTOR', 'SUPERVISOR')
  @Audited({ module: 'STOCK', entity: 'StockMovement', action: 'EXIT' })
  createExit(
    @Param('id') id: string,
    @CurrentUser() user: AuthUser,
    @Body() dto: CreateStockExitDto,
  ) {
    return this.stockItemsService.createExit(id, user.id, dto);
  }

  @Post(':id/adjustments')
  @Roles('DIRECTOR')
  @Audited({ module: 'STOCK', entity: 'StockMovement', action: 'ADJUSTMENT' })
  createAdjustment(
    @Param('id') id: string,
    @CurrentUser() user: AuthUser,
    @Body() dto: CreateStockAdjustmentDto,
  ) {
    return this.stockItemsService.createAdjustment(id, user.id, dto);
  }

  @Post(':id/transfers')
  @Roles('DIRECTOR')
  @Audited({ module: 'STOCK', entity: 'StockMovement', action: 'TRANSFER' })
  createTransfer(
    @Param('id') id: string,
    @CurrentUser() user: AuthUser,
    @Body() dto: CreateStockTransferDto,
  ) {
    return this.stockItemsService.createTransfer(id, user.id, dto);
  }

  // PR 12 — physical inventory count. Both DIRECTOR and SUPERVISOR can
  // perform one; the variance and the resulting adjustment (if any) are
  // computed server-side (see StockItemsService.createInventoryCount).
  @Post(':id/inventory-count')
  @Roles('DIRECTOR', 'SUPERVISOR')
  @Audited({ module: 'STOCK', entity: 'StockItem', action: 'INVENTORY_COUNT' })
  createInventoryCount(
    @Param('id') id: string,
    @CurrentUser() user: AuthUser,
    @Body() dto: CreateStockInventoryCountDto,
  ) {
    return this.stockItemsService.createInventoryCount(id, user.id, dto);
  }

  @Get(':id/movements')
  @Roles('DIRECTOR', 'SUPERVISOR')
  movements(@Param('id') id: string) {
    return this.stockItemsService.movements(id);
  }

  @Post(':id/submit-validation')
  @Roles('DIRECTOR')
  @Audited({
    module: 'STOCK',
    entity: 'StockItem',
    action: 'SUBMIT_VALIDATION',
  })
  submitValidation(
    @Param('id') id: string,
    @CurrentUser() user: AuthUser,
    @Body() dto: SubmitValidationDto,
  ) {
    return this.stockItemsService.submitValidation(id, user.id, dto);
  }

  @Patch(':id/approve')
  @Roles('SUPERVISOR')
  @Audited({ module: 'STOCK', entity: 'StockItem', action: 'APPROVE' })
  approve(
    @Param('id') id: string,
    @CurrentUser() user: AuthUser,
    @Body() dto: ReviewValidationDto,
  ) {
    return this.stockItemsService.approve(id, user.id, dto);
  }

  @Patch(':id/reject')
  @Roles('SUPERVISOR')
  @Audited({ module: 'STOCK', entity: 'StockItem', action: 'REJECT' })
  reject(
    @Param('id') id: string,
    @CurrentUser() user: AuthUser,
    @Body() dto: RejectValidationDto,
  ) {
    return this.stockItemsService.reject(id, user.id, dto);
  }

  @Patch(':id/request-changes')
  @Roles('SUPERVISOR')
  @Audited({ module: 'STOCK', entity: 'StockItem', action: 'REQUEST_CHANGES' })
  requestChanges(
    @Param('id') id: string,
    @CurrentUser() user: AuthUser,
    @Body() dto: RejectValidationDto,
  ) {
    return this.stockItemsService.requestChanges(id, user.id, dto);
  }

  @Get(':id/validation-history')
  @Roles('DIRECTOR', 'SUPERVISOR')
  history(@Param('id') id: string) {
    return this.stockItemsService.history(id);
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
    return this.stockItemsService.uploadDocument(
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
    return this.stockItemsService.listDocuments(id);
  }

  @Get(':id/documents/:documentId/url')
  @Roles('DIRECTOR', 'SUPERVISOR')
  getDocumentUrl(
    @Param('id') id: string,
    @Param('documentId') documentId: string,
  ) {
    return this.stockItemsService.getDocumentUrl(id, documentId);
  }

  @Delete(':id/documents/:documentId')
  @Roles('DIRECTOR')
  deleteDocument(
    @Param('id') id: string,
    @Param('documentId') documentId: string,
  ) {
    return this.stockItemsService.deleteDocument(id, documentId);
  }
}
