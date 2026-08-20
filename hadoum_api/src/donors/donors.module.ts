import { Module } from '@nestjs/common';
import { ContactsModule } from '../contacts/contacts.module';
import { FinancesModule } from '../finances/finances.module';
import { UploadModule } from '../upload/upload.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { DonorsController } from './donors.controller';
import { DonorsService } from './donors.service';
import { CampaignsController } from './campaigns.controller';
import { CampaignsService } from './campaigns.service';
import { DonationsController } from './donations.controller';
import { DonationsService } from './donations.service';
import { CommunicationsController } from './communications.controller';
import { CommunicationsService } from './communications.service';
import { DonorReportsController } from './donor-reports.controller';
import { DonorReportsService } from './donor-reports.service';
import { ReportDataService } from './report-data.service';
import { PdfReportService } from './pdf-report.service';

/**
 * PR 17 — Donor communications, periodic reports (with anonymized PDF
 * generation), and campaign/report document handling, on top of PR 15's
 * DonorProfile CRUD and PR 16's campaigns/donations/Finance integration.
 * The Module 5 frontend and Module 6 are still not part of this module.
 *
 * Imports UploadModule (new this PR) alongside ContactsModule/
 * FinancesModule — CampaignsService (documents), DonorReportsService, and
 * PdfReportService all reuse the existing UploadService/S3 abstraction
 * rather than a second upload implementation.
 */
@Module({
  imports: [ContactsModule, FinancesModule, UploadModule, NotificationsModule],
  controllers: [
    DonorsController,
    CampaignsController,
    DonationsController,
    CommunicationsController,
    DonorReportsController,
  ],
  providers: [
    DonorsService,
    CampaignsService,
    DonationsService,
    CommunicationsService,
    DonorReportsService,
    ReportDataService,
    PdfReportService,
  ],
})
export class DonorsModule {}
