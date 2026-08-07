import { Module } from '@nestjs/common';
import { UploadModule } from '../upload/upload.module';
import { ContactsController } from './contacts.controller';
import { ContactsService } from './contacts.service';
import { ContactCategoriesController } from './contact-categories.controller';
import { ContactCategoriesService } from './contact-categories.service';

@Module({
  imports: [UploadModule],
  // ContactCategoriesController MUST be listed before ContactsController.
  // Nest/Express registers routes in this order, and ContactsController
  // owns a `GET/PATCH /contacts/:id...` family — if it were registered
  // first, a request to `/contacts/categories` would be captured by
  // `:id` (id="categories") instead of reaching the categories routes.
  // (The existing StaffController has the same class of hazard, handled
  // there by ordering methods within one controller; here it's two
  // controllers, so the ordering is expressed at the module level instead.)
  controllers: [ContactCategoriesController, ContactsController],
  providers: [ContactsService, ContactCategoriesService],
})
export class ContactsModule {}
