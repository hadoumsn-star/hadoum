import { PartialType } from '@nestjs/mapped-types';
import { CreateContactDto } from './create-contact.dto';

// Deliberately does NOT add `active` — deactivation/reactivation are their
// own dedicated, more restrictively-guarded endpoints (see
// ContactsController), not a field editable through this generic update.
export class UpdateContactDto extends PartialType(CreateContactDto) {}
