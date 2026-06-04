import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { UploadService } from '../upload/upload.service';
import { StaffStatus, CandidateStatus } from '@prisma/client';

@Injectable()
export class StaffService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly uploadService: UploadService,
  ) {}

  // ─── Active staff ──────────────────────────────────────────────────────────

  async findAllStaff() {
    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);
    const endOfToday = new Date();
    endOfToday.setHours(23, 59, 59, 999);

    const [staff, activeAttendances] = await Promise.all([
      this.prisma.staffMember.findMany({ orderBy: { createdAt: 'desc' } }),
      this.prisma.staffAttendance.findMany({
        where: {
          type: { in: ['absence', 'conge'] },
          dateDebut: { lte: endOfToday },
          OR: [
            { dateFin: null },
            { dateFin: { gte: startOfToday } },
          ],
        },
      }),
    ]);

    const todayMap = new Map<string, string>();
    activeAttendances.forEach(a => {
      if (!todayMap.has(a.staffId)) todayMap.set(a.staffId, a.type);
    });

    return staff.map(m => {
      const todayType = todayMap.get(m.id);
      if (todayType === 'absence') return { ...m, status: 'ABSENT' as any };
      if (todayType === 'conge')   return { ...m, status: 'CONGE' as any };
      return m;
    });
  }

  findOneStaff(id: string) {
    return this.prisma.staffMember.findUniqueOrThrow({ where: { id } });
  }

  createStaff(data: {
    firstName: string; lastName: string; role: string;
    classes?: string[]; status?: StaffStatus;
    phone?: string; email?: string; since?: string;
  }) {
    return this.prisma.staffMember.create({
      data: {
        ...data,
        classes: data.classes ?? [],
        since: data.since ? new Date(data.since) : new Date(),
      },
    });
  }

  async updateStaff(id: string, data: {
    firstName?: string; lastName?: string; role?: string;
    classes?: string[]; status?: StaffStatus;
    phone?: string; email?: string; notes?: string; scheduleJson?: string | null;
  }) {
    await this.prisma.staffMember.findUniqueOrThrow({ where: { id } });
    return this.prisma.staffMember.update({ where: { id }, data });
  }

  async uploadStaffCv(id: string, file: Express.Multer.File) {
    await this.prisma.staffMember.findUniqueOrThrow({ where: { id } });
    const cvKey = await this.uploadService.upload(file, `staff/${id}/cv`);
    return this.prisma.staffMember.update({ where: { id }, data: { cvKey } });
  }

  async uploadStaffSchedule(id: string, file: Express.Multer.File) {
    await this.prisma.staffMember.findUniqueOrThrow({ where: { id } });
    const scheduleKey = await this.uploadService.upload(file, `staff/${id}/schedule`);
    return this.prisma.staffMember.update({ where: { id }, data: { scheduleKey } });
  }

  async uploadStaffDoc(id: string, file: Express.Multer.File, label: string) {
    await this.prisma.staffMember.findUniqueOrThrow({ where: { id } });
    const key = await this.uploadService.upload(file, `staff/${id}/docs`);
    return this.prisma.staffDoc.create({ data: { staffId: id, key, label } });
  }

  getStaffDocs(staffId: string) {
    return this.prisma.staffDoc.findMany({
      where: { staffId },
      orderBy: { createdAt: 'asc' },
    });
  }

  async getStaffDocUrl(staffId: string, docId: string): Promise<{ url: string }> {
    const doc = await this.prisma.staffDoc.findUniqueOrThrow({ where: { id: docId } });
    return { url: await this.uploadService.getPresignedUrl(doc.key) };
  }

  async deleteStaffDoc(staffId: string, docId: string): Promise<void> {
    await this.prisma.staffDoc.findUniqueOrThrow({ where: { id: docId } });
    await this.prisma.staffDoc.delete({ where: { id: docId } });
  }

  // ─── Attendance ────────────────────────────────────────────────────────────

  async createAttendance(staffId: string, data: {
    type: string; motif?: string; dateDebut: string; dateFin?: string; justified?: boolean;
  }, justifFile?: Express.Multer.File) {
    await this.prisma.staffMember.findUniqueOrThrow({ where: { id: staffId } });
    let justifKey: string | undefined;
    if (justifFile) {
      justifKey = await this.uploadService.upload(justifFile, `staff/${staffId}/attendance`);
    }
    return this.prisma.staffAttendance.create({
      data: {
        staffId,
        type:      data.type,
        motif:     data.motif,
        dateDebut: new Date(data.dateDebut),
        dateFin:   data.dateFin ? new Date(data.dateFin) : undefined,
        justifKey,
        justified: !!justifFile || !!data.justified,
      },
    });
  }

  getAttendance(staffId: string) {
    return this.prisma.staffAttendance.findMany({
      where: { staffId },
      orderBy: { dateDebut: 'desc' },
    });
  }

  async getAttendancePeriod(from: Date, to: Date) {
    return this.prisma.staffAttendance.findMany({
      where: {
        type: { in: ['absence', 'conge'] },
        dateDebut: { lte: to },
        OR: [{ dateFin: null }, { dateFin: { gte: from } }],
      },
    });
  }

  async updateAttendance(id: string, data: {
    type?: string; motif?: string; dateDebut?: string; dateFin?: string | null; justified?: boolean;
  }) {
    await this.prisma.staffAttendance.findUniqueOrThrow({ where: { id } });
    return this.prisma.staffAttendance.update({
      where: { id },
      data: {
        ...(data.type      !== undefined ? { type: data.type }                          : {}),
        ...(data.motif     !== undefined ? { motif: data.motif }                        : {}),
        ...(data.dateDebut !== undefined ? { dateDebut: new Date(data.dateDebut) }      : {}),
        ...(data.dateFin   !== undefined ? { dateFin: data.dateFin ? new Date(data.dateFin) : null } : {}),
        ...(data.justified !== undefined ? { justified: data.justified }                : {}),
      },
    });
  }

  async deleteAttendance(id: string) {
    await this.prisma.staffAttendance.findUniqueOrThrow({ where: { id } });
    await this.prisma.staffAttendance.delete({ where: { id } });
  }

  async uploadAttendanceJustif(recordId: string, file: Express.Multer.File) {
    const rec = await this.prisma.staffAttendance.findUniqueOrThrow({ where: { id: recordId } });
    const justifKey = await this.uploadService.upload(file, `staff/${rec.staffId}/attendance`);
    return this.prisma.staffAttendance.update({ where: { id: recordId }, data: { justifKey, justified: true } });
  }

  async getAttendanceJustifUrl(attendanceId: string): Promise<{ url: string }> {
    const rec = await this.prisma.staffAttendance.findUniqueOrThrow({ where: { id: attendanceId } });
    if (!rec.justifKey) throw new NotFoundException('No justificatif uploaded');
    return { url: await this.uploadService.getPresignedUrl(rec.justifKey) };
  }

  async getStaffCvUrl(id: string): Promise<{ url: string }> {
    const m = await this.prisma.staffMember.findUniqueOrThrow({ where: { id } });
    if (!m.cvKey) throw new NotFoundException('No CV uploaded');
    return { url: await this.uploadService.getPresignedUrl(m.cvKey) };
  }

  async getStaffScheduleUrl(id: string): Promise<{ url: string }> {
    const m = await this.prisma.staffMember.findUniqueOrThrow({ where: { id } });
    if (!m.scheduleKey) throw new NotFoundException('No schedule uploaded');
    return { url: await this.uploadService.getPresignedUrl(m.scheduleKey) };
  }

  async exitStaff(id: string, exitReason: string, exitDate: string) {
    const member = await this.prisma.staffMember.findUniqueOrThrow({ where: { id } });
    const [former] = await this.prisma.$transaction([
      this.prisma.formerStaffMember.create({
        data: {
          firstName: member.firstName,
          lastName:  member.lastName,
          role:      member.role,
          exitDate:  new Date(exitDate),
          exitReason,
        },
      }),
      this.prisma.staffMember.delete({ where: { id } }),
    ]);
    return former;
  }

  // ─── Candidates ────────────────────────────────────────────────────────────

  findAllCandidates() {
    return this.prisma.candidate.findMany({ orderBy: { appliedAt: 'desc' } });
  }

  createCandidate(data: {
    firstName: string; lastName: string;
    targetRole?: string; phone?: string; status?: CandidateStatus;
    typeCandidature?: string; disponibleDe?: string; contactInfo?: string; notes?: string;
  }) {
    const { disponibleDe, ...rest } = data;
    return this.prisma.candidate.create({
      data: { ...rest, disponibleDe: disponibleDe ? new Date(disponibleDe) : undefined },
    });
  }

  async updateCandidate(id: string, data: {
    status?: CandidateStatus; targetRole?: string; phone?: string;
    typeCandidature?: string; disponibleDe?: string; contactInfo?: string; notes?: string;
    scheduledIntegrationDate?: string | null;
  }) {
    await this.prisma.candidate.findUniqueOrThrow({ where: { id } });
    const { disponibleDe, scheduledIntegrationDate, ...rest } = data;
    return this.prisma.candidate.update({
      where: { id },
      data: {
        ...rest,
        ...(disponibleDe !== undefined ? { disponibleDe: disponibleDe ? new Date(disponibleDe) : null } : {}),
        ...(scheduledIntegrationDate !== undefined ? { scheduledIntegrationDate: scheduledIntegrationDate ? new Date(scheduledIntegrationDate) : null } : {}),
      },
    });
  }

  async uploadCv(id: string, file: Express.Multer.File) {
    await this.prisma.candidate.findUniqueOrThrow({ where: { id } });
    const cvKey = await this.uploadService.upload(file, `candidates/${id}/cv`);
    return this.prisma.candidate.update({ where: { id }, data: { cvKey } });
  }

  async getCvUrl(id: string): Promise<{ url: string; expiresIn: number }> {
    const c = await this.prisma.candidate.findUniqueOrThrow({ where: { id } });
    if (!c.cvKey) throw new NotFoundException('No CV uploaded for this candidate');
    const url = await this.uploadService.getPresignedUrl(c.cvKey);
    return { url, expiresIn: 900 };
  }

  async uploadCandidateDoc(id: string, file: Express.Multer.File, label: string) {
    await this.prisma.candidate.findUniqueOrThrow({ where: { id } });
    const key = await this.uploadService.upload(file, `candidates/${id}/docs`);
    return this.prisma.candidateDoc.create({ data: { candidateId: id, key, label } });
  }

  getCandidateDocs(candidateId: string) {
    return this.prisma.candidateDoc.findMany({
      where: { candidateId },
      orderBy: { createdAt: 'asc' },
    });
  }

  async getCandidateDocUrl(candidateId: string, docId: string): Promise<{ url: string }> {
    const doc = await this.prisma.candidateDoc.findUniqueOrThrow({ where: { id: docId } });
    return { url: await this.uploadService.getPresignedUrl(doc.key) };
  }

  async deleteCandidateDoc(candidateId: string, docId: string): Promise<void> {
    await this.prisma.candidateDoc.findUniqueOrThrow({ where: { id: docId } });
    await this.prisma.candidateDoc.delete({ where: { id: docId } });
  }

  async promote(id: string, role?: string, since?: string) {
    const c = await this.prisma.candidate.findUniqueOrThrow({ where: { id } });
    const [member] = await this.prisma.$transaction([
      this.prisma.staffMember.create({
        data: {
          firstName: c.firstName,
          lastName:  c.lastName,
          role:      role ?? c.targetRole ?? 'Éducateur',
          classes:   [],
          status:    'PRESENT',
          phone:     c.phone ?? undefined,
          since:     since ? new Date(since) : new Date(),
        },
      }),
      this.prisma.candidate.delete({ where: { id } }),
    ]);
    return member;
  }

  // ─── Former members ────────────────────────────────────────────────────────

  findAllFormer() {
    return this.prisma.formerStaffMember.findMany({ orderBy: { exitDate: 'desc' } });
  }

  async scheduleReintegration(id: string, role: string, date: string) {
    return this.prisma.formerStaffMember.update({
      where: { id },
      data: {
        scheduledReintegrationDate: new Date(date),
        scheduledRole: role || undefined,
      },
    });
  }

  async reintegrate(id: string, role: string, reintegrationDate: string) {
    const former = await this.prisma.formerStaffMember.findUniqueOrThrow({ where: { id } });
    const [member] = await this.prisma.$transaction([
      this.prisma.staffMember.create({
        data: {
          firstName: former.firstName,
          lastName:  former.lastName,
          role:      role || former.role,
          classes:   [],
          status:    'PRESENT',
          since:     new Date(reintegrationDate),
        },
      }),
      this.prisma.formerStaffMember.delete({ where: { id } }),
    ]);
    return member;
  }
}
