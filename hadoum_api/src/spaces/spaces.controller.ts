import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { SpaceCondition, SpaceType } from '@prisma/client';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { SpacesService } from './spaces.service';
import { CreateSpaceDto } from './dto/create-space.dto';
import { UpdateSpaceDto } from './dto/update-space.dto';

@Controller('spaces')
@UseGuards(JwtAuthGuard, RolesGuard)
export class SpacesController {
  constructor(private readonly spacesService: SpacesService) {}

  @Post()
  @Roles('DIRECTOR')
  create(@Body() dto: CreateSpaceDto) {
    return this.spacesService.create(dto);
  }

  @Get()
  @Roles('DIRECTOR', 'SUPERVISOR')
  findAll(
    @Query('type') type?: SpaceType,
    @Query('condition') condition?: SpaceCondition,
    @Query('isActive') isActive?: string,
    @Query('search') search?: string,
  ) {
    return this.spacesService.findAll({
      type,
      condition,
      isActive: isActive !== undefined ? isActive === 'true' : undefined,
      search,
    });
  }

  @Get(':id')
  @Roles('DIRECTOR', 'SUPERVISOR')
  findOne(@Param('id') id: string) {
    return this.spacesService.findOne(id);
  }

  @Patch(':id')
  @Roles('DIRECTOR')
  update(@Param('id') id: string, @Body() dto: UpdateSpaceDto) {
    return this.spacesService.update(id, dto);
  }

  @Patch(':id/archive')
  @Roles('DIRECTOR')
  archive(@Param('id') id: string) {
    return this.spacesService.archive(id);
  }

  @Post(':id/documents')
  @Roles('DIRECTOR')
  @UseInterceptors(
    FileInterceptor('file', { limits: { fileSize: 10 * 1024 * 1024 } }),
  )
  uploadDocument(
    @Param('id') id: string,
    @UploadedFile() file: Express.Multer.File,
    @Body('label') label?: string,
  ) {
    return this.spacesService.uploadDocument(id, file, label);
  }

  @Get(':id/documents')
  @Roles('DIRECTOR', 'SUPERVISOR')
  listDocuments(@Param('id') id: string) {
    return this.spacesService.listDocuments(id);
  }

  @Get(':id/documents/:docId/url')
  @Roles('DIRECTOR', 'SUPERVISOR')
  getDocumentUrl(@Param('id') id: string, @Param('docId') docId: string) {
    return this.spacesService.getDocumentUrl(id, docId);
  }

  @Delete(':id/documents/:docId')
  @Roles('DIRECTOR')
  deleteDocument(@Param('id') id: string, @Param('docId') docId: string) {
    return this.spacesService.deleteDocument(id, docId);
  }
}
