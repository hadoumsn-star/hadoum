import { Body, Controller, Delete, Get, HttpCode, Param, Post, UploadedFile, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ReportsService } from './reports.service';

@Controller('reports')
export class ReportsController {
  constructor(private readonly reportsService: ReportsService) {}

  @Post('upload')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 20 * 1024 * 1024 } }))
  upload(
    @UploadedFile() file: Express.Multer.File,
    @Body('title') title: string,
    @Body('type') type: string,
    @Body('reportDate') reportDate: string,
    @Body('uploadedBy') uploadedBy?: string,
  ) {
    return this.reportsService.upload(file, title, type, reportDate, uploadedBy);
  }

  @Get()
  findAll() {
    return this.reportsService.findAll();
  }

  @Get(':id/url')
  getUrl(@Param('id') id: string) {
    return this.reportsService.getUrl(id);
  }

  @Delete(':id')
  @HttpCode(204)
  delete(@Param('id') id: string) {
    return this.reportsService.delete(id);
  }
}
