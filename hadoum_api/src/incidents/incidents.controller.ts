import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { IncidentsService } from './incidents.service';
import { CreateIncidentDto } from './dto/create-incident.dto';
import { UpdateIncidentDto } from './dto/update-incident.dto';
import { AddNoteDto } from './dto/add-note.dto';

@Controller('incidents')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('DIRECTOR', 'SUPERVISOR')
export class IncidentsController {
  constructor(private readonly incidentsService: IncidentsService) {}

  @Post()
  create(@Body() dto: CreateIncidentDto) {
    return this.incidentsService.create(dto);
  }

  @Get()
  findAll() {
    return this.incidentsService.findAll();
  }

  @Post(':id/notes')
  addNote(@Param('id') id: string, @Body() dto: AddNoteDto) {
    return this.incidentsService.addNote(id, dto);
  }

  @Patch(':id/resolve')
  resolve(@Param('id') id: string) {
    return this.incidentsService.resolve(id);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateIncidentDto) {
    return this.incidentsService.update(id, dto);
  }

  @Delete(':id')
  @HttpCode(204)
  delete(@Param('id') id: string) {
    return this.incidentsService.delete(id);
  }

  @Post(':id/attachment')
  @UseInterceptors(
    FileInterceptor('file', { limits: { fileSize: 10 * 1024 * 1024 } }),
  )
  uploadAttachment(
    @Param('id') id: string,
    @UploadedFile() file: Express.Multer.File,
  ) {
    return this.incidentsService.uploadAttachment(id, file);
  }

  @Get(':id/attachment-url')
  getAttachmentUrl(@Param('id') id: string) {
    return this.incidentsService.getAttachmentUrl(id);
  }
}
