import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateCommunicationDto } from './dto/create-communication.dto';
import { UpdateCommunicationDto } from './dto/update-communication.dto';
import { QueryCommunicationsDto } from './dto/query-communications.dto';

// Curated projection — donor identity limited to id+fullName (matches
// DonationsService's own DONATION_SELECT convention). No hard-delete
// method exists anywhere in this service — communication history is
// append-only, same policy as Donation.
const COMMUNICATION_SELECT = {
  id: true,
  type: true,
  direction: true,
  date: true,
  subject: true,
  content: true,
  documentKey: true,
  documentMime: true,
  donorReportId: true,
  createdAt: true,
  donorProfile: {
    select: {
      id: true,
      type: true,
      contact: { select: { id: true, fullName: true } },
    },
  },
  createdBy: {
    select: { id: true, name: true, initials: true, roleLabel: true },
  },
} satisfies Prisma.DonorCommunicationSelect;

export type CommunicationResponse = Prisma.DonorCommunicationGetPayload<{
  select: typeof COMMUNICATION_SELECT;
}>;

@Injectable()
export class CommunicationsService {
  constructor(private readonly prisma: PrismaService) {}

  private cleanOptional(value?: string): string | undefined {
    if (value === undefined) return undefined;
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : undefined;
  }

  async create(
    dto: CreateCommunicationDto,
    createdById: string,
  ): Promise<CommunicationResponse> {
    const donor = await this.prisma.donorProfile.findUnique({
      where: { id: dto.donorProfileId },
    });
    if (!donor) throw new NotFoundException('Profil donateur introuvable.');

    return this.prisma.donorCommunication.create({
      data: {
        donorProfileId: dto.donorProfileId,
        type: dto.type,
        direction: dto.direction,
        date: new Date(dto.date),
        subject: dto.subject.trim(),
        content: this.cleanOptional(dto.content) ?? null,
        createdById,
      },
      select: COMMUNICATION_SELECT,
    });
  }

  async findAll(query: QueryCommunicationsDto): Promise<{
    data: CommunicationResponse[];
    total: number;
    page: number;
    pageSize: number;
  }> {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 20;

    const where: Prisma.DonorCommunicationWhereInput = {
      ...(query.donorProfileId ? { donorProfileId: query.donorProfileId } : {}),
      ...(query.type ? { type: query.type } : {}),
      ...(query.direction ? { direction: query.direction } : {}),
      ...(query.from || query.to
        ? {
            date: {
              ...(query.from ? { gte: new Date(query.from) } : {}),
              ...(query.to ? { lte: new Date(query.to) } : {}),
            },
          }
        : {}),
    };

    const [data, total] = await Promise.all([
      this.prisma.donorCommunication.findMany({
        where,
        select: COMMUNICATION_SELECT,
        orderBy: [{ date: 'desc' }, { id: 'asc' }],
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.donorCommunication.count({ where }),
    ]);

    return { data, total, page, pageSize };
  }

  async findOne(id: string): Promise<CommunicationResponse> {
    const communication = await this.prisma.donorCommunication.findUnique({
      where: { id },
      select: COMMUNICATION_SELECT,
    });
    if (!communication)
      throw new NotFoundException('Communication introuvable.');
    return communication;
  }

  async update(
    id: string,
    dto: UpdateCommunicationDto,
  ): Promise<CommunicationResponse> {
    const existing = await this.prisma.donorCommunication.findUnique({
      where: { id },
    });
    if (!existing) throw new NotFoundException('Communication introuvable.');

    return this.prisma.donorCommunication.update({
      where: { id },
      data: {
        ...(dto.subject !== undefined ? { subject: dto.subject.trim() } : {}),
        ...(dto.content !== undefined
          ? { content: this.cleanOptional(dto.content) ?? null }
          : {}),
      },
      select: COMMUNICATION_SELECT,
    });
  }
}
