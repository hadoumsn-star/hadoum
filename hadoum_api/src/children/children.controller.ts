import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { DocumentType } from '@prisma/client';
import { ChildrenService } from './children.service';
import { CreateChildDto } from './dto/create-child.dto';
import { UpdateChildDto } from './dto/update-child.dto';
import {
  CreateConsultationDto,
  CreateMedicalRecordDto,
  CreateVaccinationDto,
} from './dto/create-medical.dto';
import { CreateObservationDto } from './dto/create-observation.dto';
import { CreateEventDto } from './dto/create-event.dto';
import { CreateDocumentDto } from './dto/create-document.dto';

@Controller('children')
export class ChildrenController {
  constructor(private readonly childrenService: ChildrenService) {}

  @Post()
  create(@Body() dto: CreateChildDto) {
    return this.childrenService.create(dto);
  }

  @Get()
  findAll() {
    return this.childrenService.findAll();
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.childrenService.findOne(id);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateChildDto) {
    return this.childrenService.update(id, dto);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.childrenService.remove(id);
  }

  @Post(':id/exit')
  exitChild(
    @Param('id') id: string,
    @Body() body: { exitType: string; exitDate: string; exitReason: string; exitResponsable?: string; dateRetour?: string },
  ) {
    return this.childrenService.exitChild(id, body);
  }

  @Post(':id/reactivate')
  reactivateChild(@Param('id') id: string) {
    return this.childrenService.reactivateChild(id);
  }

  // ─── Medical ──────────────────────────────────────────────────────────────

  @Post(':id/school')
  upsertSchool(
    @Param('id') id: string,
    @Body() dto: { currentLevel: string; schoolName?: string; schoolType?: string },
  ) {
    return this.childrenService.upsertSchoolRecord(id, dto);
  }

  @Post(':id/medical')
  upsertMedical(@Param('id') id: string, @Body() dto: CreateMedicalRecordDto) {
    return this.childrenService.upsertMedicalRecord(id, dto);
  }

  @Post(':id/medical/vaccinations')
  addVaccination(@Param('id') id: string, @Body() dto: CreateVaccinationDto) {
    return this.childrenService.addVaccination(id, dto);
  }

  @Post(':id/medical/consultations')
  addConsultation(@Param('id') id: string, @Body() dto: CreateConsultationDto) {
    return this.childrenService.addConsultation(id, dto);
  }

  // ─── Daily observations ───────────────────────────────────────────────────

  @Post(':id/observations')
  addObservation(@Param('id') id: string, @Body() dto: CreateObservationDto) {
    return this.childrenService.addObservation(id, dto);
  }

  @Get(':id/observations')
  getObservations(@Param('id') id: string) {
    return this.childrenService.getObservations(id);
  }

  // ─── Event log ────────────────────────────────────────────────────────────

  @Post(':id/events')
  addEvent(@Param('id') id: string, @Body() dto: CreateEventDto) {
    return this.childrenService.addEvent(id, dto);
  }

  @Get(':id/events')
  getEventLog(@Param('id') id: string) {
    return this.childrenService.getEventLog(id);
  }

  @Patch(':id/events/:eventId')
  updateEvent(
    @Param('id') id: string,
    @Param('eventId') eventId: string,
    @Body() dto: Partial<CreateEventDto>,
  ) {
    return this.childrenService.updateEvent(id, eventId, dto);
  }

  @Delete(':id/events/:eventId')
  deleteEvent(@Param('id') id: string, @Param('eventId') eventId: string) {
    return this.childrenService.deleteEvent(id, eventId);
  }

  // ─── Documents ────────────────────────────────────────────────────────────

  @Post(':id/documents')
  addDocument(@Param('id') id: string, @Body() dto: CreateDocumentDto) {
    return this.childrenService.addDocument(id, dto);
  }

  @Post(':id/documents/:docId/replace')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 10 * 1024 * 1024 } }))
  replaceDocument(
    @Param('id') id: string,
    @Param('docId') docId: string,
    @UploadedFile() file: Express.Multer.File,
  ) {
    return this.childrenService.replaceDocument(id, docId, file);
  }

  @Post(':id/documents/upload')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 10 * 1024 * 1024 } }))
  uploadDocument(
    @Param('id') id: string,
    @UploadedFile() file: Express.Multer.File,
    @Body('type') type: DocumentType,
    @Body('label') label: string,
    @Body('uploadedBy') uploadedBy?: string,
  ) {
    return this.childrenService.uploadDocument(id, file, type, label, uploadedBy);
  }

  @Get(':id/documents')
  getDocuments(@Param('id') id: string) {
    return this.childrenService.getDocuments(id);
  }

  @Get(':id/documents/:docId/url')
  getDocumentUrl(@Param('id') id: string, @Param('docId') docId: string) {
    return this.childrenService.getDocumentUrl(id, docId);
  }
}
