import { Body, Controller, Get, Param, Patch, Post, UploadedFile, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { StaffService } from './staff.service';
import { StaffStatus, CandidateStatus } from '@prisma/client';

@Controller('staff')
export class StaffController {
  constructor(private readonly staffService: StaffService) {}

  // ─── Active staff ──────────────────────────────────────────────────────────

  @Get()
  findAll() { return this.staffService.findAllStaff(); }

  @Post()
  create(@Body() body: {
    firstName: string; lastName: string; role: string;
    classes?: string[]; status?: StaffStatus;
    phone?: string; email?: string; since?: string;
  }) { return this.staffService.createStaff(body); }

  @Patch(':id')
  update(@Param('id') id: string, @Body() body: {
    firstName?: string; lastName?: string; role?: string;
    classes?: string[]; status?: StaffStatus;
    phone?: string; email?: string;
  }) { return this.staffService.updateStaff(id, body); }

  @Post(':id/exit')
  exit(@Param('id') id: string, @Body() body: { exitReason: string; exitDate: string }) {
    return this.staffService.exitStaff(id, body.exitReason, body.exitDate);
  }

  // ─── Candidates ────────────────────────────────────────────────────────────

  @Get('candidates')
  findCandidates() { return this.staffService.findAllCandidates(); }

  @Post('candidates')
  createCandidate(@Body() body: {
    firstName: string; lastName: string;
    targetRole?: string; phone?: string; status?: CandidateStatus;
  }) { return this.staffService.createCandidate(body); }

  @Patch('candidates/:id')
  updateCandidate(@Param('id') id: string, @Body() body: {
    status?: CandidateStatus; targetRole?: string; phone?: string;
  }) { return this.staffService.updateCandidate(id, body); }

  @Post('candidates/:id/cv')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 5 * 1024 * 1024 } }))
  uploadCv(@Param('id') id: string, @UploadedFile() file: Express.Multer.File) {
    return this.staffService.uploadCv(id, file);
  }

  @Get('candidates/:id/cv-url')
  getCvUrl(@Param('id') id: string) {
    return this.staffService.getCvUrl(id);
  }

  @Post('candidates/:id/promote')
  promote(@Param('id') id: string) {
    return this.staffService.promote(id);
  }

  // ─── Former members ────────────────────────────────────────────────────────

  @Get('former')
  findFormer() { return this.staffService.findAllFormer(); }

  @Post('former/:id/reintegrate')
  reintegrate(@Param('id') id: string, @Body() body: { role: string; reintegrationDate: string }) {
    return this.staffService.reintegrate(id, body.role, body.reintegrationDate);
  }
}
