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
import { StaffService } from './staff.service';
import {
  StaffStatus,
  CandidateStatus,
  StaffPresenceStatus,
} from '@prisma/client';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { AuthUser } from '../auth/types/request-with-user';

@Controller('staff')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('DIRECTOR', 'SUPERVISOR')
export class StaffController {
  constructor(private readonly staffService: StaffService) {}

  // ─── Active staff ──────────────────────────────────────────────────────────

  @Get()
  findAll() {
    return this.staffService.findAllStaff();
  }

  @Post()
  create(
    @Body()
    body: {
      firstName: string;
      lastName: string;
      role: string;
      classes?: string[];
      status?: StaffStatus;
      phone?: string;
      email?: string;
      since?: string;
    },
  ) {
    return this.staffService.createStaff(body);
  }

  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body()
    body: {
      firstName?: string;
      lastName?: string;
      role?: string;
      classes?: string[];
      status?: StaffStatus;
      phone?: string;
      email?: string;
      notes?: string;
      // Weekly schedule (PR 10 adds Samedi/Dimanche keys, unstructured on
      // the backend — see StaffService.updateStaff/WeekPlan on the frontend).
      scheduleJson?: string | null;
    },
  ) {
    return this.staffService.updateStaff(id, body);
  }

  @Post(':id/cv')
  @UseInterceptors(
    FileInterceptor('file', { limits: { fileSize: 10 * 1024 * 1024 } }),
  )
  uploadStaffCv(
    @Param('id') id: string,
    @UploadedFile() file: Express.Multer.File,
  ) {
    return this.staffService.uploadStaffCv(id, file);
  }

  @Post(':id/schedule')
  @UseInterceptors(
    FileInterceptor('file', { limits: { fileSize: 10 * 1024 * 1024 } }),
  )
  uploadStaffSchedule(
    @Param('id') id: string,
    @UploadedFile() file: Express.Multer.File,
  ) {
    return this.staffService.uploadStaffSchedule(id, file);
  }

  @Post(':id/docs')
  @UseInterceptors(
    FileInterceptor('file', { limits: { fileSize: 10 * 1024 * 1024 } }),
  )
  uploadStaffDoc(
    @Param('id') id: string,
    @UploadedFile() file: Express.Multer.File,
    @Body('label') label: string,
  ) {
    return this.staffService.uploadStaffDoc(id, file, label);
  }

  @Get(':id/cv-url')
  getStaffCvUrl(@Param('id') id: string) {
    return this.staffService.getStaffCvUrl(id);
  }

  @Get(':id/schedule-url')
  getStaffScheduleUrl(@Param('id') id: string) {
    return this.staffService.getStaffScheduleUrl(id);
  }

  @Post(':id/exit')
  exit(
    @Param('id') id: string,
    @Body() body: { exitReason: string; exitDate: string },
  ) {
    return this.staffService.exitStaff(id, body.exitReason, body.exitDate);
  }

  // ─── Candidates ────────────────────────────────────────────────────────────

  @Get('candidates')
  findCandidates() {
    return this.staffService.findAllCandidates();
  }

  @Post('candidates')
  createCandidate(
    @Body()
    body: {
      firstName: string;
      lastName: string;
      targetRole?: string;
      phone?: string;
      status?: CandidateStatus;
    },
  ) {
    return this.staffService.createCandidate(body);
  }

  @Patch('candidates/:id')
  updateCandidate(
    @Param('id') id: string,
    @Body()
    body: {
      status?: CandidateStatus;
      targetRole?: string;
      phone?: string;
      typeCandidature?: string;
      disponibleDe?: string;
      contactInfo?: string;
      notes?: string;
      scheduledIntegrationDate?: string | null;
    },
  ) {
    return this.staffService.updateCandidate(id, body);
  }

  @Post('candidates/:id/cv')
  @UseInterceptors(
    FileInterceptor('file', { limits: { fileSize: 5 * 1024 * 1024 } }),
  )
  uploadCv(@Param('id') id: string, @UploadedFile() file: Express.Multer.File) {
    return this.staffService.uploadCv(id, file);
  }

  @Get('candidates/:id/cv-url')
  getCvUrl(@Param('id') id: string) {
    return this.staffService.getCvUrl(id);
  }

  @Post('candidates/:id/docs')
  @UseInterceptors(
    FileInterceptor('file', { limits: { fileSize: 10 * 1024 * 1024 } }),
  )
  uploadCandidateDoc(
    @Param('id') id: string,
    @UploadedFile() file: Express.Multer.File,
    @Body('label') label: string,
  ) {
    return this.staffService.uploadCandidateDoc(id, file, label);
  }

  @Get('candidates/:id/docs')
  getCandidateDocs(@Param('id') id: string) {
    return this.staffService.getCandidateDocs(id);
  }

  @Get('candidates/:id/docs/:docId/url')
  getCandidateDocUrl(@Param('id') id: string, @Param('docId') docId: string) {
    return this.staffService.getCandidateDocUrl(id, docId);
  }

  @Delete('candidates/:id/docs/:docId')
  deleteCandidateDoc(@Param('id') id: string, @Param('docId') docId: string) {
    return this.staffService.deleteCandidateDoc(id, docId);
  }

  @Post('candidates/:id/promote')
  promote(
    @Param('id') id: string,
    @Body() body: { role?: string; since?: string },
  ) {
    return this.staffService.promote(id, body.role, body.since);
  }

  // ─── Former members ────────────────────────────────────────────────────────

  @Get('former')
  findFormer() {
    return this.staffService.findAllFormer();
  }

  @Patch('former/:id')
  scheduleReintegration(
    @Param('id') id: string,
    @Body() body: { role?: string; scheduledReintegrationDate?: string },
  ) {
    return this.staffService.scheduleReintegration(
      id,
      body.role ?? '',
      body.scheduledReintegrationDate ?? '',
    );
  }

  @Post('former/:id/reintegrate')
  reintegrate(
    @Param('id') id: string,
    @Body() body: { role: string; reintegrationDate: string },
  ) {
    return this.staffService.reintegrate(id, body.role, body.reintegrationDate);
  }

  // ─── Attendance ────────────────────────────────────────────────────────────

  @Post(':id/attendance')
  @UseInterceptors(
    FileInterceptor('justif', { limits: { fileSize: 10 * 1024 * 1024 } }),
  )
  createAttendance(
    @Param('id') id: string,
    @Body()
    body: {
      type: string;
      motif?: string;
      dateDebut: string;
      dateFin?: string;
      justified?: string;
    },
    @UploadedFile() justif?: Express.Multer.File,
  ) {
    return this.staffService.createAttendance(
      id,
      { ...body, justified: body.justified === 'true' },
      justif,
    );
  }

  @Get(':id/attendance')
  getAttendance(@Param('id') id: string) {
    return this.staffService.getAttendance(id);
  }

  @Get('attendance/monthly')
  getAttendancePeriod(@Query('from') from: string, @Query('to') to: string) {
    const now = new Date();
    const start = from
      ? new Date(from)
      : new Date(now.getFullYear(), now.getMonth(), 1);
    const end = to
      ? new Date(to + 'T23:59:59')
      : new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59);
    return this.staffService.getAttendancePeriod(start, end);
  }

  @Patch('attendance/:recordId')
  updateAttendance(
    @Param('recordId') recordId: string,
    @Body()
    body: {
      type?: string;
      motif?: string;
      dateDebut?: string;
      dateFin?: string | null;
    },
  ) {
    return this.staffService.updateAttendance(recordId, body);
  }

  @Delete('attendance/:recordId')
  deleteAttendance(@Param('recordId') recordId: string) {
    return this.staffService.deleteAttendance(recordId);
  }

  @Post('attendance/:recordId/justif')
  @UseInterceptors(
    FileInterceptor('file', { limits: { fileSize: 10 * 1024 * 1024 } }),
  )
  uploadAttendanceJustif(
    @Param('recordId') recordId: string,
    @UploadedFile() file: Express.Multer.File,
  ) {
    return this.staffService.uploadAttendanceJustif(recordId, file);
  }

  @Get('attendance/:recordId/justif-url')
  getAttendanceJustifUrl(@Param('recordId') recordId: string) {
    return this.staffService.getAttendanceJustifUrl(recordId);
  }

  // ─── Daily presence confirmation (PR 10) ───────────────────────────────────
  // Distinct from the Congé/Retard/Absence endpoints above. Read stays open
  // to the class-level DIRECTOR/SUPERVISOR roles; confirming/resetting is
  // DIRECTOR-only per PR 10's permission requirement.

  @Get('presence')
  listDailyPresence(@Query('date') date: string) {
    return this.staffService.listDailyPresence(date);
  }

  @Post(':id/presence')
  @Roles('DIRECTOR')
  confirmPresence(
    @Param('id') id: string,
    @CurrentUser() user: AuthUser,
    @Body() body: { date: string; status: StaffPresenceStatus },
  ) {
    return this.staffService.confirmPresence(
      id,
      body.date,
      body.status,
      user.id,
    );
  }

  @Delete(':id/presence')
  @Roles('DIRECTOR')
  resetPresence(@Param('id') id: string, @Query('date') date: string) {
    return this.staffService.resetPresence(id, date);
  }

  @Get(':id/docs')
  getStaffDocs(@Param('id') id: string) {
    return this.staffService.getStaffDocs(id);
  }

  @Get(':id/docs/:docId/url')
  getStaffDocUrl(@Param('id') id: string, @Param('docId') docId: string) {
    return this.staffService.getStaffDocUrl(id, docId);
  }

  @Delete(':id/docs/:docId')
  deleteStaffDoc(@Param('id') id: string, @Param('docId') docId: string) {
    return this.staffService.deleteStaffDoc(id, docId);
  }

  // ─── Single staff member (must come after all static routes) ──────────────

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.staffService.findOneStaff(id);
  }
}
