import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { UploadService } from '../upload/upload.service';

@Injectable()
export class ReportsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly uploadService: UploadService,
  ) {}

  async upload(
    file: Express.Multer.File,
    title: string,
    type: string,
    reportDate: string,
    uploadedBy?: string,
  ) {
    const fileKey = await this.uploadService.upload(file, 'reports');
    return this.prisma.report.create({
      data: {
        title,
        type,
        fileKey,
        mimeType: file.mimetype,
        reportDate: new Date(reportDate),
        uploadedBy: uploadedBy ?? 'staff',
      },
    });
  }

  findAll() {
    return this.prisma.report.findMany({
      orderBy: { createdAt: 'desc' },
    });
  }

  async getUrl(id: string): Promise<{ url: string; expiresIn: number }> {
    const report = await this.prisma.report.findUnique({ where: { id } });
    if (!report) throw new NotFoundException('Report not found');
    const url = await this.uploadService.getPresignedUrl(report.fileKey);
    return { url, expiresIn: 900 };
  }

  async delete(id: string): Promise<void> {
    const report = await this.prisma.report.findUnique({ where: { id } });
    if (!report) throw new NotFoundException('Report not found');
    await this.uploadService.deleteFile(report.fileKey);
    await this.prisma.report.delete({ where: { id } });
  }
}
