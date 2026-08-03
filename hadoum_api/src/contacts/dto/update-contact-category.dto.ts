import { PartialType } from '@nestjs/mapped-types';
import { CreateContactCategoryDto } from './create-contact-category.dto';

// `active` is deliberately excluded here too — deactivation is its own
// endpoint (`PATCH /contacts/categories/:id/deactivate`), which additionally
// refuses to run while active contacts still reference the category.
export class UpdateContactCategoryDto extends PartialType(
  CreateContactCategoryDto,
) {}
