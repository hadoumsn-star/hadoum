import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { UploadService } from '../upload/upload.service';
import {
  StaffStatus,
  CandidateStatus,
  StaffPresenceStatus,
} from '@prisma/client';

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
          OR: [{ dateFin: null }, { dateFin: { gte: startOfToday } }],
        },
      }),
    ]);

    const todayMap = new Map<string, string>();
    activeAttendances.forEach((a) => {
      if (!todayMap.has(a.staffId)) todayMap.set(a.staffId, a.type);
    });

    return staff.map((m) => {
      const todayType = todayMap.get(m.id);
      if (todayType === 'absence') return { ...m, status: 'ABSENT' };
      if (todayType === 'conge') return { ...m, status: 'CONGE' };
      return m;
    });
  }

  findOneStaff(id: string) {
    return this.prisma.staffMember.findUniqueOrThrow({ where: { id } });
  }

  createStaff(data: {
    firstName: string;
    lastName: string;
    role: string;
    classes?: string[];
    status?: StaffStatus;
    phone?: string;
    email?: string;
    since?: string;
  }) {
    return this.prisma.staffMember.create({
      data: {
        ...data,
        classes: data.classes ?? [],
        since: data.since ? new Date(data.since) : new Date(),
      },
    });
  }

  async updateStaff(
    id: string,
    data: {
      firstName?: string;
      lastName?: string;
      role?: string;
      classes?: string[];
      status?: StaffStatus;
      phone?: string;
      email?: string;
      notes?: string;
      scheduleJson?: string | null;
    },
  ) {
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
    const scheduleKey = await this.uploadService.upload(
      file,
      `staff/${id}/schedule`,
    );
    return this.prisma.staffMember.update({
      where: { id },
      data: { scheduleKey },
    });
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

  async getStaffDocUrl(
    staffId: string,
    docId: string,
  ): Promise<{ url: string }> {
    const doc = await this.prisma.staffDoc.findFirstOrThrow({
      where: { id: docId, staffId },
    });
    return { url: await this.uploadService.getPresignedUrl(doc.key) };
  }

  async deleteStaffDoc(staffId: string, docId: string): Promise<void> {
    const doc = await this.prisma.staffDoc.findFirstOrThrow({
      where: { id: docId, staffId },
    });
    await this.prisma.staffDoc.delete({ where: { id: doc.id } });
  }

  // ─── Attendance ────────────────────────────────────────────────────────────

  async createAttendance(
    staffId: string,
    data: {
      type: string;
      motif?: string;
      dateDebut: string;
      dateFin?: string;
      justified?: boolean;
    },
    justifFile?: Express.Multer.File,
  ) {
    await this.prisma.staffMember.findUniqueOrThrow({ where: { id: staffId } });
    let justifKey: string | undefined;
    if (justifFile) {
      justifKey = await this.uploadService.upload(
        justifFile,
        `staff/${staffId}/attendance`,
      );
    }
    return this.prisma.staffAttendance.create({
      data: {
        staffId,
        type: data.type,
        motif: data.motif,
        dateDebut: new Date(data.dateDebut),
        dateFin: data.dateFin ? new Date(data.dateFin) : undefined,
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

  async updateAttendance(
    id: string,
    data: {
      type?: string;
      motif?: string;
      dateDebut?: string;
      dateFin?: string | null;
      justified?: boolean;
    },
  ) {
    await this.prisma.staffAttendance.findUniqueOrThrow({ where: { id } });
    return this.prisma.staffAttendance.update({
      where: { id },
      data: {
        ...(data.type !== undefined ? { type: data.type } : {}),
        ...(data.motif !== undefined ? { motif: data.motif } : {}),
        ...(data.dateDebut !== undefined
          ? { dateDebut: new Date(data.dateDebut) }
          : {}),
        ...(data.dateFin !== undefined
          ? { dateFin: data.dateFin ? new Date(data.dateFin) : null }
          : {}),
        ...(data.justified !== undefined ? { justified: data.justified } : {}),
      },
    });
  }

  async deleteAttendance(id: string) {
    await this.prisma.staffAttendance.findUniqueOrThrow({ where: { id } });
    await this.prisma.staffAttendance.delete({ where: { id } });
  }

  async uploadAttendanceJustif(recordId: string, file: Express.Multer.File) {
    const rec = await this.prisma.staffAttendance.findUniqueOrThrow({
      where: { id: recordId },
    });
    const justifKey = await this.uploadService.upload(
      file,
      `staff/${rec.staffId}/attendance`,
    );
    return this.prisma.staffAttendance.update({
      where: { id: recordId },
      data: { justifKey, justified: true },
    });
  }

  async getAttendanceJustifUrl(attendanceId: string): Promise<{ url: string }> {
    const rec = await this.prisma.staffAttendance.findUniqueOrThrow({
      where: { id: attendanceId },
    });
    if (!rec.justifKey) throw new NotFoundException('No justificatif uploaded');
    return { url: await this.uploadService.getPresignedUrl(rec.justifKey) };
  }

  async getStaffCvUrl(id: string): Promise<{ url: string }> {
    const m = await this.prisma.staffMember.findUniqueOrThrow({
      where: { id },
    });
    if (!m.cvKey) throw new NotFoundException('No CV uploaded');
    return { url: await this.uploadService.getPresignedUrl(m.cvKey) };
  }

  async getStaffScheduleUrl(id: string): Promise<{ url: string }> {
    const m = await this.prisma.staffMember.findUniqueOrThrow({
      where: { id },
    });
    if (!m.scheduleKey) throw new NotFoundException('No schedule uploaded');
    return { url: await this.uploadService.getPresignedUrl(m.scheduleKey) };
  }

  async exitStaff(id: string, exitReason: string, exitDate: string) {
    const member = await this.prisma.staffMember.findUniqueOrThrow({
      where: { id },
    });
    const [former] = await this.prisma.$transaction([
      this.prisma.formerStaffMember.create({
        data: {
          firstName: member.firstName,
          lastName: member.lastName,
          role: member.role,
          exitDate: new Date(exitDate),
          exitReason,
        },
      }),
      this.prisma.staffMember.delete({ where: { id } }),
    ]);
    return former;
  }

  // ─── Daily presence confirmation (PR 10) ───────────────────────────────────
  // Distinct from the StaffAttendance (Congé/Retard/Absence) leave records
  // above: this is a same-day "did this person show up" confirmation, made
  // by the DIRECTOR. A row only exists once confirmed — see the
  // StaffPresenceConfirmation model's own comment for why "non confirmée"
  // is never itself stored.

  private dayBounds(dateStr: string): { start: Date; end: Date } {
    const start = new Date(dateStr);
    const end = new Date(start);
    end.setHours(23, 59, 59, 999);
    return { start, end };
  }

  async listDailyPresence(dateStr: string) {
    const { start, end } = this.dayBounds(dateStr);

    const [staff, confirmations, onLeave] = await Promise.all([
      this.prisma.staffMember.findMany({
        orderBy: [{ firstName: 'asc' }, { lastName: 'asc' }],
      }),
      this.prisma.staffPresenceConfirmation.findMany({
        where: { date: start },
        include: { confirmedBy: { select: { id: true, name: true } } },
      }),
      this.prisma.staffAttendance.findMany({
        where: {
          type: { in: ['absence', 'conge'] },
          dateDebut: { lte: end },
          OR: [{ dateFin: null }, { dateFin: { gte: start } }],
        },
      }),
    ]);

    const confirmationByStaff = new Map(
      confirmations.map((c) => [c.staffId, c]),
    );
    const onLeaveByStaff = new Map(onLeave.map((a) => [a.staffId, a.type]));

    const entries = staff.map((m) => {
      const confirmation = confirmationByStaff.get(m.id);
      return {
        staffId: m.id,
        firstName: m.firstName,
        lastName: m.lastName,
        role: m.role,
        onLeave: onLeaveByStaff.get(m.id) ?? null,
        status: confirmation?.status ?? ('NON_CONFIRMED' as const),
        confirmedBy: confirmation?.confirmedBy ?? null,
        confirmedAt: confirmation?.updatedAt ?? null,
      };
    });

    return {
      date: dateStr,
      entries,
      // A staff member currently on Congé/Absence (`onLeave` set — see
      // above) is not eligible for daily presence confirmation at all: they
      // are not expected to show up, so an absent confirmation would be
      // meaningless and leaving them counted here inflated "non confirmées"
      // with people who were never actually pending a decision. Excluded
      // from this count the same way `entries` itself never excludes them
      // (the row still shows, flagged via `onLeave`, in the UI) — only the
      // *count* changes.
      nonConfirmedCount: entries.filter(
        (e) => e.status === 'NON_CONFIRMED' && !e.onLeave,
      ).length,
    };
  }

  // Module 6 (PR 21) — multi-day staff attendance trend for
  // GET /dashboard/trends. This intentionally does NOT call
  // listDailyPresence() in a loop (that would be N+1 queries for an
  // N-day range) — instead it fetches each of the three underlying
  // tables ONCE for the whole [startStr, endStr) range and buckets them
  // per day in JS, while preserving listDailyPresence's exact rules
  // verbatim: a staff member on Congé/Absence for a given day is
  // "onLeave" and excluded from that day's non-confirmed count (but
  // still eligible to be counted PRESENT/ABSENT if a confirmation exists
  // for them anyway); a day with no confirmation row for a given staff
  // member is NON_CONFIRMED. See staff-attendance-trend parity test,
  // which asserts this produces identical present/absent/nonConfirmed
  // numbers to listDailyPresence() for a single-day range.
  //
  // `dateStrs` — every "YYYY-MM-DD" day to report on, ascending. Only
  // aggregate counts are returned per day: never staff names/ids.
  async listPresenceTrend(dateStrs: string[]) {
    if (dateStrs.length === 0) return [];

    const rangeStart = this.dayBounds(dateStrs[0]).start;
    const rangeEnd = this.dayBounds(dateStrs[dateStrs.length - 1]).end;

    const [staff, confirmations, onLeave] = await Promise.all([
      this.prisma.staffMember.findMany({ select: { id: true } }),
      this.prisma.staffPresenceConfirmation.findMany({
        where: { date: { gte: rangeStart, lte: rangeEnd } },
        select: { staffId: true, date: true, status: true },
      }),
      this.prisma.staffAttendance.findMany({
        where: {
          type: { in: ['absence', 'conge'] },
          dateDebut: { lte: rangeEnd },
          OR: [{ dateFin: null }, { dateFin: { gte: rangeStart } }],
        },
        select: { staffId: true, dateDebut: true, dateFin: true },
      }),
    ]);

    return dateStrs.map((dateStr) => {
      const { start, end } = this.dayBounds(dateStr);
      const confirmationByStaff = new Map(
        confirmations
          .filter((c) => c.date.getTime() === start.getTime())
          .map((c) => [c.staffId, c.status]),
      );
      const onLeaveStaffIds = new Set(
        onLeave
          .filter(
            (a) =>
              a.dateDebut <= end && (a.dateFin === null || a.dateFin >= start),
          )
          .map((a) => a.staffId),
      );

      let present = 0;
      let absent = 0;
      let nonConfirmed = 0;
      for (const m of staff) {
        const status = confirmationByStaff.get(m.id) ?? 'NON_CONFIRMED';
        const onLeaveNow = onLeaveStaffIds.has(m.id);
        if (status === 'PRESENT') present++;
        else if (status === 'ABSENT') absent++;
        else if (!onLeaveNow) nonConfirmed++;
      }

      return { date: dateStr, present, absent, nonConfirmed };
    });
  }

  async confirmPresence(
    staffId: string,
    dateStr: string,
    status: StaffPresenceStatus,
    confirmedById: string,
  ) {
    await this.prisma.staffMember.findUniqueOrThrow({ where: { id: staffId } });
    const { start: date } = this.dayBounds(dateStr);
    return this.prisma.staffPresenceConfirmation.upsert({
      where: { staffId_date: { staffId, date } },
      create: {
        staffId,
        date,
        status,
        confirmed: status === 'PRESENT',
        confirmedById,
      },
      update: { status, confirmed: status === 'PRESENT', confirmedById },
      include: { confirmedBy: { select: { id: true, name: true } } },
    });
  }

  async resetPresence(staffId: string, dateStr: string): Promise<void> {
    const { start: date } = this.dayBounds(dateStr);
    await this.prisma.staffPresenceConfirmation.deleteMany({
      where: { staffId, date },
    });
  }

  // ─── Candidates ────────────────────────────────────────────────────────────

  findAllCandidates() {
    return this.prisma.candidate.findMany({ orderBy: { appliedAt: 'desc' } });
  }

  createCandidate(data: {
    firstName: string;
    lastName: string;
    targetRole?: string;
    phone?: string;
    status?: CandidateStatus;
    typeCandidature?: string;
    disponibleDe?: string;
    contactInfo?: string;
    notes?: string;
  }) {
    const { disponibleDe, ...rest } = data;
    return this.prisma.candidate.create({
      data: {
        ...rest,
        disponibleDe: disponibleDe ? new Date(disponibleDe) : undefined,
      },
    });
  }

  async updateCandidate(
    id: string,
    data: {
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
    await this.prisma.candidate.findUniqueOrThrow({ where: { id } });
    const { disponibleDe, scheduledIntegrationDate, ...rest } = data;
    return this.prisma.candidate.update({
      where: { id },
      data: {
        ...rest,
        ...(disponibleDe !== undefined
          ? { disponibleDe: disponibleDe ? new Date(disponibleDe) : null }
          : {}),
        ...(scheduledIntegrationDate !== undefined
          ? {
              scheduledIntegrationDate: scheduledIntegrationDate
                ? new Date(scheduledIntegrationDate)
                : null,
            }
          : {}),
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
    if (!c.cvKey)
      throw new NotFoundException('No CV uploaded for this candidate');
    const url = await this.uploadService.getPresignedUrl(c.cvKey);
    return { url, expiresIn: 900 };
  }

  async uploadCandidateDoc(
    id: string,
    file: Express.Multer.File,
    label: string,
  ) {
    await this.prisma.candidate.findUniqueOrThrow({ where: { id } });
    const key = await this.uploadService.upload(file, `candidates/${id}/docs`);
    return this.prisma.candidateDoc.create({
      data: { candidateId: id, key, label },
    });
  }

  getCandidateDocs(candidateId: string) {
    return this.prisma.candidateDoc.findMany({
      where: { candidateId },
      orderBy: { createdAt: 'asc' },
    });
  }

  async getCandidateDocUrl(
    candidateId: string,
    docId: string,
  ): Promise<{ url: string }> {
    const doc = await this.prisma.candidateDoc.findFirstOrThrow({
      where: { id: docId, candidateId },
    });
    return { url: await this.uploadService.getPresignedUrl(doc.key) };
  }

  async deleteCandidateDoc(candidateId: string, docId: string): Promise<void> {
    const doc = await this.prisma.candidateDoc.findFirstOrThrow({
      where: { id: docId, candidateId },
    });
    await this.prisma.candidateDoc.delete({ where: { id: doc.id } });
  }

  async promote(id: string, role?: string, since?: string) {
    const c = await this.prisma.candidate.findUniqueOrThrow({ where: { id } });
    const [member] = await this.prisma.$transaction([
      this.prisma.staffMember.create({
        data: {
          firstName: c.firstName,
          lastName: c.lastName,
          role: role ?? c.targetRole ?? 'Éducateur',
          classes: [],
          status: 'PRESENT',
          phone: c.phone ?? undefined,
          since: since ? new Date(since) : new Date(),
        },
      }),
      this.prisma.candidate.delete({ where: { id } }),
    ]);
    return member;
  }

  // ─── Former members ────────────────────────────────────────────────────────

  findAllFormer() {
    return this.prisma.formerStaffMember.findMany({
      orderBy: { exitDate: 'desc' },
    });
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
    const former = await this.prisma.formerStaffMember.findUniqueOrThrow({
      where: { id },
    });
    const [member] = await this.prisma.$transaction([
      this.prisma.staffMember.create({
        data: {
          firstName: former.firstName,
          lastName: former.lastName,
          role: role || former.role,
          classes: [],
          status: 'PRESENT',
          since: new Date(reintegrationDate),
        },
      }),
      this.prisma.formerStaffMember.delete({ where: { id } }),
    ]);
    return member;
  }
}
