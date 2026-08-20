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
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { AuthUser } from '../auth/types/request-with-user';
import { Audited } from '../audit-logs/decorators/audited.decorator';
import { DonorReportsService } from './donor-reports.service';
import { CreateDonorReportDto } from './dto/create-donor-report.dto';
import { GenerateDonorReportDto } from './dto/generate-donor-report.dto';
import { QueryDonorReportsDto } from './dto/query-donor-reports.dto';

// PR 17 — DonorReport lifecycle (DRAFT -> GENERATED -> SENT) + its photos.
// Same role split as every other Module 5 controller: BOARD absent
// entirely, SUPERVISOR read-only, DIRECTOR full read/write/lifecycle.
@Controller('donor-reports')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('DIRECTOR', 'SUPERVISOR')
export class DonorReportsController {
  constructor(private readonly donorReportsService: DonorReportsService) {}

  @Get()
  findAll(@Query() query: QueryDonorReportsDto) {
    return this.donorReportsService.findAll(query);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.donorReportsService.findOne(id);
  }

  @Get(':id/file-url')
  getFileUrl(@Param('id') id: string) {
    return this.donorReportsService.getFileUrl(id);
  }

  @Post()
  @Roles('DIRECTOR')
  @Audited({ module: 'DONORS', entity: 'DonorReport', action: 'CREATE' })
  create(@Body() dto: CreateDonorReportDto, @CurrentUser() user: AuthUser) {
    return this.donorReportsService.create(dto, user.id);
  }

  @Post(':id/generate')
  @Roles('DIRECTOR')
  @Audited({ module: 'DONORS', entity: 'DonorReport', action: 'GENERATE' })
  generate(@Param('id') id: string, @Body() dto: GenerateDonorReportDto) {
    return this.donorReportsService.generate(id, dto);
  }

  @Post(':id/mark-sent')
  @Roles('DIRECTOR')
  @Audited({ module: 'DONORS', entity: 'DonorReport', action: 'MARK_SENT' })
  markSent(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.donorReportsService.markSent(id, user.id);
  }

  // ─── Photos ─────────────────────────────────────────────────────────────

  @Post(':id/photos')
  @Roles('DIRECTOR')
  @UseInterceptors(
    FileInterceptor('file', { limits: { fileSize: 10 * 1024 * 1024 } }),
  )
  @Audited({ module: 'DONORS', entity: 'DonorReportPhoto', action: 'CREATE' })
  uploadPhoto(
    @Param('id') id: string,
    @UploadedFile() file: Express.Multer.File,
    @Body('caption') caption?: string,
    @Body('approved') approved?: string,
  ) {
    return this.donorReportsService.uploadPhoto(
      id,
      file,
      caption,
      approved === 'true',
    );
  }

  @Get(':id/photos/:photoId/url')
  getPhotoUrl(@Param('id') id: string, @Param('photoId') photoId: string) {
    return this.donorReportsService.getPhotoUrl(id, photoId);
  }

  @Patch(':id/photos/:photoId/approve')
  @Roles('DIRECTOR')
  @Audited({
    module: 'DONORS',
    entity: 'DonorReportPhoto',
    action: 'APPROVE',
    idParam: 'photoId',
  })
  approvePhoto(@Param('id') id: string, @Param('photoId') photoId: string) {
    return this.donorReportsService.approvePhoto(id, photoId);
  }

  @Delete(':id/photos/:photoId')
  @Roles('DIRECTOR')
  @Audited({
    module: 'DONORS',
    entity: 'DonorReportPhoto',
    action: 'DELETE',
    idParam: 'photoId',
  })
  deletePhoto(@Param('id') id: string, @Param('photoId') photoId: string) {
    return this.donorReportsService.deletePhoto(id, photoId);
  }
}
