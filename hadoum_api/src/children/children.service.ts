import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
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
import { UploadService } from '../upload/upload.service';
import { DocumentType, SchoolType } from '@prisma/client';

@Injectable()
export class ChildrenService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly uploadService: UploadService,
  ) {}

  async create(dto: CreateChildDto) {
    const last = await this.prisma.child.findFirst({
      orderBy: { fileNumber: 'desc' },
      select: { fileNumber: true },
    });
    const lastNum = last
      ? parseInt(last.fileNumber.replace('HAD-', ''), 10)
      : 0;
    const fileNumber = `HAD-${String(lastNum + 1).padStart(4, '0')}`;
    return this.prisma.child.create({
      data: {
        ...dto,
        fileNumber,
        dateOfBirth: new Date(dto.dateOfBirth),
        entryDate: new Date(dto.entryDate),
      },
      select: {
        id: true,
        fileNumber: true,
        firstName: true,
        lastName: true,
        dateOfBirth: true,
        gender: true,
        status: true,
        entryDate: true,
        guardianName: true,
        guardianPhone: true,
        schoolRecord: { select: { currentLevel: true } },
        documents: { select: { id: true, type: true } },
      },
    });
  }

  findAll() {
    return this.prisma.child.findMany({
      select: {
        id: true,
        fileNumber: true,
        firstName: true,
        lastName: true,
        dateOfBirth: true,
        gender: true,
        status: true,
        entryDate: true,
        guardianName: true,
        guardianPhone: true,
        isActive: true,
        exitType: true,
        exitDate: true,
        exitReturnDate: true,
        exitReason: true,
        exitResponsable: true,
        schoolRecord: { select: { currentLevel: true } },
        documents: { select: { id: true, type: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async findOne(id: string) {
    const child = await this.prisma.child.findUnique({
      where: { id },
      include: {
        medicalRecord: { include: { vaccinations: true, consultations: true } },
        psychRecord: { include: { sessions: true } },
        schoolRecord: { include: { results: true } },
        dailyObservations: { orderBy: { date: 'desc' } },
        documents: true,
        eventLogs: { orderBy: { createdAt: 'desc' } },
      },
    });
    if (!child) throw new NotFoundException(`Child ${id} not found`);
    return child;
  }

  async update(id: string, dto: UpdateChildDto) {
    await this.findOne(id);
    const { exitReturnDate, exitDate, ...rest } = dto;
    return this.prisma.child.update({
      where: { id },
      data: {
        ...rest,
        ...(exitReturnDate !== undefined
          ? { exitReturnDate: exitReturnDate ? new Date(exitReturnDate) : null }
          : {}),
        ...(exitDate !== undefined
          ? { exitDate: exitDate ? new Date(exitDate) : null }
          : {}),
      },
    });
  }

  async exitChild(
    id: string,
    data: {
      exitType: string;
      exitDate: string;
      exitReason: string;
      exitResponsable?: string;
      dateRetour?: string;
    },
  ) {
    await this.findOne(id);
    const updated = await this.prisma.child.update({
      where: { id },
      data: {
        isActive: false,
        exitType: data.exitType,
        exitDate: new Date(data.exitDate),
        exitReturnDate: data.dateRetour ? new Date(data.dateRetour) : null,
        exitReason: data.exitReason,
        exitResponsable: data.exitResponsable ?? null,
      },
    });
    const details = JSON.stringify({
      dateDepart: data.exitDate,
      motif: data.exitReason,
      dateRetour: data.dateRetour ?? null,
    });
    await this.prisma.eventLog.create({
      data: {
        childId: id,
        eventType: 'SORTIE',
        summary: `Sortie ${data.exitType}`,
        details,
        author: data.exitResponsable ?? 'staff',
      },
    });
    return updated;
  }

  async reactivateChild(id: string) {
    await this.findOne(id);
    return this.prisma.child.update({
      where: { id },
      data: {
        isActive: true,
        exitType: null,
        exitDate: null,
        exitReturnDate: null,
        exitReason: null,
        exitResponsable: null,
      },
    });
  }

  async remove(id: string) {
    await this.findOne(id);
    return this.prisma.child.delete({ where: { id } });
  }

  // ─── School ───────────────────────────────────────────────────────────────

  async upsertSchoolRecord(
    childId: string,
    dto: { currentLevel: string; schoolName?: string; schoolType?: string },
  ) {
    await this.findOne(childId);
    return this.prisma.schoolRecord.upsert({
      where: { childId },
      create: {
        childId,
        currentLevel: dto.currentLevel,
        schoolName: dto.schoolName ?? 'École Hadoum',
        schoolType:
          (dto.schoolType as SchoolType | undefined) ?? 'ECOLE_PUBLIQUE',
      },
      update: {
        currentLevel: dto.currentLevel,
        ...(dto.schoolName && { schoolName: dto.schoolName }),
      },
    });
  }

  // ─── Medical ──────────────────────────────────────────────────────────────

  async upsertMedicalRecord(childId: string, dto: CreateMedicalRecordDto) {
    await this.findOne(childId);
    return this.prisma.medicalRecord.upsert({
      where: { childId },
      create: { childId, ...dto },
      update: dto,
    });
  }

  async addVaccination(childId: string, dto: CreateVaccinationDto) {
    const medical = await this.prisma.medicalRecord.findUnique({
      where: { childId },
    });
    if (!medical)
      throw new NotFoundException(`No medical record for child ${childId}`);
    return this.prisma.vaccination.create({
      data: {
        medicalRecordId: medical.id,
        ...dto,
        date: new Date(dto.date),
        nextDueDate: dto.nextDueDate ? new Date(dto.nextDueDate) : undefined,
      },
    });
  }

  async addConsultation(childId: string, dto: CreateConsultationDto) {
    const medical = await this.prisma.medicalRecord.findUnique({
      where: { childId },
    });
    if (!medical)
      throw new NotFoundException(`No medical record for child ${childId}`);
    return this.prisma.consultation.create({
      data: {
        medicalRecordId: medical.id,
        ...dto,
        date: new Date(dto.date),
      },
    });
  }

  // ─── Daily observations ───────────────────────────────────────────────────

  async addObservation(childId: string, dto: CreateObservationDto) {
    await this.findOne(childId);
    return this.prisma.dailyObservation.create({
      data: { childId, ...dto, date: new Date(dto.date) },
    });
  }

  getObservations(childId: string) {
    return this.prisma.dailyObservation.findMany({
      where: { childId },
      orderBy: { date: 'desc' },
    });
  }

  // ─── Event log ────────────────────────────────────────────────────────────

  async addEvent(childId: string, dto: CreateEventDto) {
    await this.findOne(childId);
    return this.prisma.eventLog.create({
      data: { childId, ...dto },
    });
  }

  getEventLog(childId: string) {
    return this.prisma.eventLog.findMany({
      where: { childId },
      orderBy: { createdAt: 'desc' },
    });
  }

  async updateEvent(
    childId: string,
    eventId: string,
    dto: Partial<CreateEventDto>,
  ) {
    return this.prisma.eventLog.update({
      where: { id: eventId },
      data: dto,
    });
  }

  async deleteEvent(childId: string, eventId: string) {
    await this.prisma.eventLog.deleteMany({ where: { id: eventId, childId } });
  }

  // ─── Documents ────────────────────────────────────────────────────────────

  async addDocument(childId: string, dto: CreateDocumentDto) {
    await this.findOne(childId);
    return this.prisma.document.create({
      data: { childId, ...dto },
    });
  }

  async replaceDocument(
    childId: string,
    docId: string,
    file: Express.Multer.File,
  ) {
    const doc = await this.prisma.document.findFirstOrThrow({
      where: { id: docId, childId },
    });
    const newKey = await this.uploadService.upload(file, `children/${childId}`);
    return this.prisma.document.update({
      where: { id: doc.id },
      data: { fileUrl: newKey },
    });
  }

  async uploadDocument(
    childId: string,
    file: Express.Multer.File,
    type: DocumentType,
    label: string,
    uploadedBy?: string,
  ) {
    await this.findOne(childId);
    const s3Key = await this.uploadService.upload(file, `children/${childId}`);
    return this.prisma.document.create({
      data: {
        childId,
        type,
        label,
        fileUrl: s3Key,
        uploadedBy: uploadedBy ?? 'staff',
      },
    });
  }

  async getDocumentUrl(
    childId: string,
    docId: string,
  ): Promise<{ url: string; expiresIn: number }> {
    const doc = await this.prisma.document.findFirst({
      where: { id: docId, childId },
    });
    if (!doc) throw new Error('Document not found');

    // Support both old format (full URL) and new format (S3 key)
    const key = doc.fileUrl.startsWith('http')
      ? new URL(doc.fileUrl).pathname.replace(/^\//, '')
      : doc.fileUrl;

    const url = await this.uploadService.getPresignedUrl(key);
    return { url, expiresIn: 900 };
  }

  getDocuments(childId: string) {
    return this.prisma.document.findMany({
      where: { childId },
      orderBy: { createdAt: 'desc' },
    });
  }

  async deleteDocument(childId: string, docId: string): Promise<void> {
    const doc = await this.prisma.document.findFirst({
      where: { id: docId, childId },
    });
    if (!doc) throw new NotFoundException('Document not found');

    // Remove the DB record first so the slot is freed for re-upload even if S3 cleanup fails
    await this.prisma.document.delete({ where: { id: doc.id } });

    const key = doc.fileUrl.startsWith('http')
      ? new URL(doc.fileUrl).pathname.replace(/^\//, '')
      : doc.fileUrl;
    try {
      await this.uploadService.deleteFile(key);
    } catch {
      // Orphaned S3 object is acceptable; the document record is gone either way
    }
  }
}
