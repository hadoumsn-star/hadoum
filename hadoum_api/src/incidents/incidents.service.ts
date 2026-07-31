import { Injectable, NotFoundException } from '@nestjs/common';
import { IncidentStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { UploadService } from '../upload/upload.service';
import { CreateIncidentDto } from './dto/create-incident.dto';
import { UpdateIncidentDto } from './dto/update-incident.dto';
import { AddNoteDto } from './dto/add-note.dto';

@Injectable()
export class IncidentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly uploadService: UploadService,
  ) {}

  create(dto: CreateIncidentDto) {
    return this.prisma.incident.create({
      data: {
        title: dto.title,
        type: dto.type,
        description: dto.description,
        signaledBy: dto.signaledBy,
        date: dto.date ? new Date(dto.date) : new Date(),
      },
      include: { notes: true },
    });
  }

  findAll() {
    return this.prisma.incident.findMany({
      include: { notes: { orderBy: { createdAt: 'asc' } } },
      orderBy: { createdAt: 'desc' },
    });
  }

  async addNote(id: string, dto: AddNoteDto) {
    const incident = await this.prisma.incident.findUnique({ where: { id } });
    if (!incident) throw new NotFoundException('Incident not found');

    await this.prisma.incidentNote.create({
      data: { incidentId: id, text: dto.text, author: dto.author },
    });

    return this.prisma.incident.update({
      where: { id },
      data: { status: IncidentStatus.PLANIFIE },
      include: { notes: { orderBy: { createdAt: 'asc' } } },
    });
  }

  async update(id: string, dto: UpdateIncidentDto) {
    const incident = await this.prisma.incident.findUnique({ where: { id } });
    if (!incident) throw new NotFoundException('Incident not found');

    return this.prisma.incident.update({
      where: { id },
      data: {
        ...(dto.title !== undefined ? { title: dto.title } : {}),
        ...(dto.type !== undefined ? { type: dto.type } : {}),
        ...(dto.description !== undefined ? { description: dto.description } : {}),
        ...(dto.signaledBy !== undefined ? { signaledBy: dto.signaledBy } : {}),
        ...(dto.date !== undefined ? { date: new Date(dto.date) } : {}),
      },
      include: { notes: { orderBy: { createdAt: 'asc' } } },
    });
  }

  async delete(id: string): Promise<void> {
    const incident = await this.prisma.incident.findUnique({ where: { id } });
    if (!incident) throw new NotFoundException('Incident not found');
    if (incident.attachmentKey) await this.uploadService.deleteFile(incident.attachmentKey);
    await this.prisma.incident.delete({ where: { id } });
  }

  async resolve(id: string) {
    const incident = await this.prisma.incident.findUnique({ where: { id } });
    if (!incident) throw new NotFoundException('Incident not found');

    return this.prisma.incident.update({
      where: { id },
      data: { status: IncidentStatus.RESOLU },
      include: { notes: { orderBy: { createdAt: 'asc' } } },
    });
  }

  async uploadAttachment(id: string, file: Express.Multer.File) {
    const incident = await this.prisma.incident.findUnique({ where: { id } });
    if (!incident) throw new NotFoundException('Incident not found');
    if (incident.attachmentKey) await this.uploadService.deleteFile(incident.attachmentKey);
    const attachmentKey = await this.uploadService.upload(file, `incidents/${id}`);
    return this.prisma.incident.update({
      where: { id },
      data: { attachmentKey, attachmentMime: file.mimetype },
      include: { notes: { orderBy: { createdAt: 'asc' } } },
    });
  }

  async getAttachmentUrl(id: string): Promise<{ url: string; expiresIn: number }> {
    const incident = await this.prisma.incident.findUnique({ where: { id } });
    if (!incident) throw new NotFoundException('Incident not found');
    if (!incident.attachmentKey) throw new NotFoundException('No attachment uploaded');
    const url = await this.uploadService.getPresignedUrl(incident.attachmentKey);
    return { url, expiresIn: 900 };
  }
}
