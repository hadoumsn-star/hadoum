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
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { ContactsService } from './contacts.service';
import { CreateContactDto } from './dto/create-contact.dto';
import { UpdateContactDto } from './dto/update-contact.dto';
import { QueryContactsDto } from './dto/query-contacts.dto';

@Controller('contacts')
@UseGuards(JwtAuthGuard, RolesGuard)
export class ContactsController {
  constructor(private readonly contactsService: ContactsService) {}

  @Get()
  @Roles('DIRECTOR', 'SUPERVISOR')
  findAll(@Query() query: QueryContactsDto) {
    return this.contactsService.findAll(query);
  }

  @Get(':id')
  @Roles('DIRECTOR', 'SUPERVISOR')
  findOne(@Param('id') id: string) {
    return this.contactsService.findOne(id);
  }

  @Post()
  @Roles('DIRECTOR', 'SUPERVISOR')
  create(@Body() dto: CreateContactDto, @Query('force') force?: string) {
    return this.contactsService.create(dto, force === 'true');
  }

  @Patch(':id')
  @Roles('DIRECTOR', 'SUPERVISOR')
  update(@Param('id') id: string, @Body() dto: UpdateContactDto) {
    return this.contactsService.update(id, dto);
  }

  @Patch(':id/deactivate')
  @Roles('DIRECTOR')
  deactivate(@Param('id') id: string) {
    return this.contactsService.deactivate(id);
  }

  @Patch(':id/reactivate')
  @Roles('DIRECTOR')
  reactivate(@Param('id') id: string) {
    return this.contactsService.reactivate(id);
  }

  @Post(':id/photo')
  @Roles('DIRECTOR', 'SUPERVISOR')
  @UseInterceptors(
    FileInterceptor('file', { limits: { fileSize: 10 * 1024 * 1024 } }),
  )
  uploadPhoto(
    @Param('id') id: string,
    @UploadedFile() file: Express.Multer.File,
  ) {
    return this.contactsService.uploadPhoto(id, file);
  }

  @Get(':id/photo-url')
  @Roles('DIRECTOR', 'SUPERVISOR')
  getPhotoUrl(@Param('id') id: string) {
    return this.contactsService.getPhotoUrl(id);
  }

  @Delete(':id/photo')
  @Roles('DIRECTOR', 'SUPERVISOR')
  deletePhoto(@Param('id') id: string) {
    return this.contactsService.deletePhoto(id);
  }
}
