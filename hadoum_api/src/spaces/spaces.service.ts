import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, SpaceCondition, SpaceType } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { UploadService } from '../upload/upload.service';
import { CreateSpaceDto } from './dto/create-space.dto';
import { UpdateSpaceDto } from './dto/update-space.dto';

interface FindAllFilters {
  type?: SpaceType;
  condition?: SpaceCondition;
  isActive?: boolean;
  search?: string;
}

@Injectable()
export class SpacesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly uploadService: UploadService,
  ) {}

  create(dto: CreateSpaceDto) {
    return this.prisma.space.create({
      data: {
        name: dto.name,
        type: dto.type,
        description: dto.description,
        building: dto.building,
        floor: dto.floor,
        zone: dto.zone,
        condition: dto.condition,
        capacity: dto.capacity,
        equipment: dto.equipment ?? [],
        observations: dto.observations,
        isActive: dto.isActive,
      },
    });
  }

  findAll(filters: FindAllFilters) {
    const where: Prisma.SpaceWhereInput = {
      ...(filters.type !== undefined ? { type: filters.type } : {}),
      ...(filters.condition !== undefined
        ? { condition: filters.condition }
        : {}),
      ...(filters.isActive !== undefined ? { isActive: filters.isActive } : {}),
      ...(filters.search
        ? {
            name: {
              contains: filters.search,
              mode: Prisma.QueryMode.insensitive,
            },
          }
        : {}),
    };

    return this.prisma.space.findMany({
      where,
      orderBy: { createdAt: 'desc' },
    });
  }

  async findOne(id: string) {
    const space = await this.prisma.space.findUnique({
      where: { id },
      include: {
        documents: { orderBy: { createdAt: 'desc' } },
        maintenanceTickets: { orderBy: { createdAt: 'desc' } },
      },
    });
    if (!space) throw new NotFoundException('Space not found');
    return space;
  }

  async update(id: string, dto: UpdateSpaceDto) {
    const space = await this.prisma.space.findUnique({ where: { id } });
    if (!space) throw new NotFoundException('Space not found');

    return this.prisma.space.update({
      where: { id },
      data: {
        ...(dto.name !== undefined ? { name: dto.name } : {}),
        ...(dto.type !== undefined ? { type: dto.type } : {}),
        ...(dto.description !== undefined
          ? { description: dto.description }
          : {}),
        ...(dto.building !== undefined ? { building: dto.building } : {}),
        ...(dto.floor !== undefined ? { floor: dto.floor } : {}),
        ...(dto.zone !== undefined ? { zone: dto.zone } : {}),
        ...(dto.condition !== undefined ? { condition: dto.condition } : {}),
        ...(dto.capacity !== undefined ? { capacity: dto.capacity } : {}),
        ...(dto.equipment !== undefined ? { equipment: dto.equipment } : {}),
        ...(dto.observations !== undefined
          ? { observations: dto.observations }
          : {}),
        ...(dto.isActive !== undefined ? { isActive: dto.isActive } : {}),
      },
    });
  }

  async archive(id: string) {
    const space = await this.prisma.space.findUnique({ where: { id } });
    if (!space) throw new NotFoundException('Space not found');
    return this.prisma.space.update({
      where: { id },
      data: { isActive: false },
    });
  }

  async uploadDocument(id: string, file: Express.Multer.File, label?: string) {
    const space = await this.prisma.space.findUnique({ where: { id } });
    if (!space) throw new NotFoundException('Space not found');

    const fileKey = await this.uploadService.upload(file, `spaces/${id}`);
    return this.prisma.spaceDocument.create({
      data: { spaceId: id, fileKey, fileMime: file.mimetype, label },
    });
  }

  async listDocuments(id: string) {
    const space = await this.prisma.space.findUnique({ where: { id } });
    if (!space) throw new NotFoundException('Space not found');
    return this.prisma.spaceDocument.findMany({
      where: { spaceId: id },
      orderBy: { createdAt: 'desc' },
    });
  }

  async getDocumentUrl(
    id: string,
    docId: string,
  ): Promise<{ url: string; expiresIn: number }> {
    const doc = await this.prisma.spaceDocument.findUnique({
      where: { id: docId },
    });
    if (!doc || doc.spaceId !== id)
      throw new NotFoundException('Document not found');
    const url = await this.uploadService.getPresignedUrl(doc.fileKey);
    return { url, expiresIn: 900 };
  }

  async deleteDocument(id: string, docId: string): Promise<void> {
    const doc = await this.prisma.spaceDocument.findUnique({
      where: { id: docId },
    });
    if (!doc || doc.spaceId !== id)
      throw new NotFoundException('Document not found');
    await this.uploadService.deleteFile(doc.fileKey);
    await this.prisma.spaceDocument.delete({ where: { id: docId } });
  }
}
