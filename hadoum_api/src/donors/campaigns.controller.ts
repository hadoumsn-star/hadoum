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
import { CampaignsService } from './campaigns.service';
import { CreateCampaignDto } from './dto/create-campaign.dto';
import { UpdateCampaignDto } from './dto/update-campaign.dto';
import { QueryCampaignsDto } from './dto/query-campaigns.dto';

// PR 16 — Cagnottes ponctuelles (FundraisingCampaign). BOARD is absent from
// every @Roles() below — no detailed campaign administration for BOARD in
// this PR (its own synthetic view is later). EDUCATOR is absent for the
// same reason every other admin/finance-adjacent module already excludes
// it.
@Controller('campaigns')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('DIRECTOR', 'SUPERVISOR')
export class CampaignsController {
  constructor(private readonly campaignsService: CampaignsService) {}

  @Get()
  findAll(@Query() query: QueryCampaignsDto) {
    return this.campaignsService.findAll(query);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.campaignsService.findOne(id);
  }

  // Every route below overrides the class-level DIRECTOR+SUPERVISOR gate to
  // DIRECTOR only — campaign creation/editing/lifecycle is operational, not
  // something SUPERVISOR co-manages (same split DonorsController already
  // uses for DonorProfile).

  @Post()
  @Roles('DIRECTOR')
  @Audited({
    module: 'DONORS',
    entity: 'FundraisingCampaign',
    action: 'CREATE',
  })
  create(@Body() dto: CreateCampaignDto, @CurrentUser() user: AuthUser) {
    return this.campaignsService.create(dto, user.id);
  }

  @Patch(':id')
  @Roles('DIRECTOR')
  @Audited({
    module: 'DONORS',
    entity: 'FundraisingCampaign',
    action: 'UPDATE',
  })
  update(@Param('id') id: string, @Body() dto: UpdateCampaignDto) {
    return this.campaignsService.update(id, dto);
  }

  // Lifecycle operations, not an arbitrary status PATCH — see
  // CampaignsService's ALLOWED_TRANSITIONS.

  @Post(':id/activate')
  @Roles('DIRECTOR')
  @Audited({
    module: 'DONORS',
    entity: 'FundraisingCampaign',
    action: 'ACTIVATE',
  })
  activate(@Param('id') id: string) {
    return this.campaignsService.activate(id);
  }

  @Post(':id/terminate')
  @Roles('DIRECTOR')
  @Audited({
    module: 'DONORS',
    entity: 'FundraisingCampaign',
    action: 'TERMINATE',
  })
  terminate(@Param('id') id: string) {
    return this.campaignsService.terminate(id);
  }

  @Post(':id/cancel')
  @Roles('DIRECTOR')
  @Audited({
    module: 'DONORS',
    entity: 'FundraisingCampaign',
    action: 'CANCEL',
  })
  cancel(@Param('id') id: string) {
    return this.campaignsService.cancel(id);
  }

  // ─── Documents (PR 17) ────────────────────────────────────────────────
  // Same shape as SupplierContractsController's own document routes —
  // upload/list/view DIRECTOR+SUPERVISOR-appropriate, upload/delete
  // DIRECTOR only. BOARD gets none of these (absent from the class-level
  // @Roles above).

  @Post(':id/documents')
  @Roles('DIRECTOR')
  @UseInterceptors(
    FileInterceptor('file', { limits: { fileSize: 10 * 1024 * 1024 } }),
  )
  @Audited({ module: 'DONORS', entity: 'CampaignDocument', action: 'CREATE' })
  uploadDocument(
    @Param('id') id: string,
    @UploadedFile() file: Express.Multer.File,
    @Body('label') label?: string,
  ) {
    return this.campaignsService.uploadDocument(id, file, label);
  }

  @Get(':id/documents')
  listDocuments(@Param('id') id: string) {
    return this.campaignsService.listDocuments(id);
  }

  @Get(':id/documents/:documentId/url')
  getDocumentUrl(
    @Param('id') id: string,
    @Param('documentId') documentId: string,
  ) {
    return this.campaignsService.getDocumentUrl(id, documentId);
  }

  @Delete(':id/documents/:documentId')
  @Roles('DIRECTOR')
  @Audited({
    module: 'DONORS',
    entity: 'CampaignDocument',
    action: 'DELETE',
    idParam: 'documentId',
  })
  deleteDocument(
    @Param('id') id: string,
    @Param('documentId') documentId: string,
  ) {
    return this.campaignsService.deleteDocument(id, documentId);
  }
}
