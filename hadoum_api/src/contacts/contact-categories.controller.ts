import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { ContactCategoriesService } from './contact-categories.service';
import { CreateContactCategoryDto } from './dto/create-contact-category.dto';
import { UpdateContactCategoryDto } from './dto/update-contact-category.dto';

// Registered ahead of ContactsController in ContactsModule so that
// `/contacts/categories...` is matched before ContactsController's
// `/contacts/:id` — see the module file for why this ordering matters.
@Controller('contacts/categories')
@UseGuards(JwtAuthGuard, RolesGuard)
export class ContactCategoriesController {
  constructor(private readonly categoriesService: ContactCategoriesService) {}

  @Get()
  @Roles('DIRECTOR', 'SUPERVISOR')
  findAll(@Query('active') active?: string) {
    return this.categoriesService.findAll(active !== 'false');
  }

  @Post()
  @Roles('DIRECTOR')
  create(@Body() dto: CreateContactCategoryDto) {
    return this.categoriesService.create(dto);
  }

  @Patch(':id')
  @Roles('DIRECTOR')
  update(@Param('id') id: string, @Body() dto: UpdateContactCategoryDto) {
    return this.categoriesService.update(id, dto);
  }

  @Patch(':id/deactivate')
  @Roles('DIRECTOR')
  deactivate(@Param('id') id: string) {
    return this.categoriesService.deactivate(id);
  }
}
