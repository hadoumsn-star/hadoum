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
  GoodsMovementStatus,
  GoodsMovementType,
  ValidationStatus,
} from '@prisma/client';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { AuthUser } from '../auth/types/request-with-user';
import { GoodsMovementLogsService } from './goods-movement-logs.service';
import { CreateGoodsMovementDto } from './dto/create-goods-movement.dto';
import { UpdateGoodsMovementDto } from './dto/update-goods-movement.dto';
import { RecordGoodsReturnDto } from './dto/record-goods-return.dto';
import { ReviewValidationDto } from './dto/review-validation.dto';
import { RejectValidationDto } from './dto/reject-validation.dto';

@Controller('goods-movement-logs')
@UseGuards(JwtAuthGuard, RolesGuard)
export class GoodsMovementLogsController {
  constructor(
    private readonly goodsMovementLogsService: GoodsMovementLogsService,
  ) {}

  @Post()
  @Roles('DIRECTOR')
  create(@Body() dto: CreateGoodsMovementDto, @CurrentUser() user: AuthUser) {
    return this.goodsMovementLogsService.create(dto, user.id);
  }

  @Get()
  @Roles('DIRECTOR', 'SUPERVISOR')
  findAll(
    @Query('search') search?: string,
    @Query('movementType') movementType?: GoodsMovementType,
    @Query('status') status?: GoodsMovementStatus,
    @Query('stockItemId') stockItemId?: string,
    @Query('inventoryAssetId') inventoryAssetId?: string,
    @Query('source') source?: string,
    @Query('destination') destination?: string,
    @Query('overdueReturn') overdueReturn?: string,
    @Query('validationStatus') validationStatus?: ValidationStatus,
    @Query('dateFrom') dateFrom?: string,
    @Query('dateTo') dateTo?: string,
  ) {
    return this.goodsMovementLogsService.findAll({
      search,
      movementType,
      status,
      stockItemId,
      inventoryAssetId,
      source,
      destination,
      overdueReturn: overdueReturn === 'true',
      validationStatus,
      dateFrom,
      dateTo,
    });
  }

  @Get(':id')
  @Roles('DIRECTOR', 'SUPERVISOR')
  findOne(@Param('id') id: string) {
    return this.goodsMovementLogsService.findOne(id);
  }

  @Patch(':id')
  @Roles('DIRECTOR')
  update(@Param('id') id: string, @Body() dto: UpdateGoodsMovementDto) {
    return this.goodsMovementLogsService.update(id, dto);
  }

  @Patch(':id/record-return')
  @Roles('DIRECTOR')
  recordReturn(@Param('id') id: string, @Body() dto: RecordGoodsReturnDto) {
    return this.goodsMovementLogsService.recordReturn(id, dto);
  }

  @Patch(':id/archive')
  @Roles('DIRECTOR')
  archive(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.goodsMovementLogsService.archive(id, user.id);
  }

  @Post(':id/submit-validation')
  @Roles('DIRECTOR')
  submitValidation(@Param('id') id: string) {
    return this.goodsMovementLogsService.submitValidation(id);
  }

  @Patch(':id/approve')
  @Roles('SUPERVISOR')
  approve(
    @Param('id') id: string,
    @CurrentUser() user: AuthUser,
    @Body() dto: ReviewValidationDto,
  ) {
    return this.goodsMovementLogsService.approve(id, user.id, dto);
  }

  @Patch(':id/reject')
  @Roles('SUPERVISOR')
  reject(
    @Param('id') id: string,
    @CurrentUser() user: AuthUser,
    @Body() dto: RejectValidationDto,
  ) {
    return this.goodsMovementLogsService.reject(id, user.id, dto);
  }

  @Patch(':id/request-changes')
  @Roles('SUPERVISOR')
  requestChanges(
    @Param('id') id: string,
    @CurrentUser() user: AuthUser,
    @Body() dto: RejectValidationDto,
  ) {
    return this.goodsMovementLogsService.requestChanges(id, user.id, dto);
  }

  @Get(':id/validation-history')
  @Roles('DIRECTOR', 'SUPERVISOR')
  history(@Param('id') id: string) {
    return this.goodsMovementLogsService.history(id);
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
    return this.goodsMovementLogsService.uploadDocument(
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
    return this.goodsMovementLogsService.listDocuments(id);
  }

  @Get(':id/documents/:documentId/url')
  @Roles('DIRECTOR', 'SUPERVISOR')
  getDocumentUrl(
    @Param('id') id: string,
    @Param('documentId') documentId: string,
  ) {
    return this.goodsMovementLogsService.getDocumentUrl(id, documentId);
  }

  @Delete(':id/documents/:documentId')
  @Roles('DIRECTOR')
  deleteDocument(
    @Param('id') id: string,
    @Param('documentId') documentId: string,
  ) {
    return this.goodsMovementLogsService.deleteDocument(id, documentId);
  }
}
