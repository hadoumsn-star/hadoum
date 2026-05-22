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

  findAllStaff() {
    return this.prisma.staffMember.findMany({ orderBy: { createdAt: 'desc' } });
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
    phone?: string; email?: string;
  }) {
    await this.prisma.staffMember.findUniqueOrThrow({ where: { id } });
    return this.prisma.staffMember.update({ where: { id }, data });
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
  }) {
    return this.prisma.candidate.create({ data });
  }

  async updateCandidate(id: string, data: {
    status?: CandidateStatus; targetRole?: string; phone?: string;
  }) {
    await this.prisma.candidate.findUniqueOrThrow({ where: { id } });
    return this.prisma.candidate.update({ where: { id }, data });
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

  async promote(id: string) {
    const c = await this.prisma.candidate.findUniqueOrThrow({ where: { id } });
    const [member] = await this.prisma.$transaction([
      this.prisma.staffMember.create({
        data: {
          firstName: c.firstName,
          lastName:  c.lastName,
          role:      c.targetRole ?? 'Éducateur',
          classes:   [],
          status:    'PRESENT',
          phone:     c.phone ?? undefined,
          since:     new Date(),
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
