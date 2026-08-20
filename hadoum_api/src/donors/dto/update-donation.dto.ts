import { IsOptional, IsString } from 'class-validator';

// Deliberately just these two fields — not `PartialType(CreateDonationDto)`.
// Once a Donation has generated its Finance Transaction (every Donation,
// always — see DonationsService.create), amount/date/donorProfileId/
// campaignId/transactionId are immutable financial facts (see the PR 16
// plan's "Donation mutation policy"). `notes`/`reference` are the only
// fields that can never desynchronize Finance, so they're the only ones
// this update surface exposes — anything else sent by a caller is
// silently stripped by the global ValidationPipe's `whitelist: true`,
// never partially applied.
export class UpdateDonationDto {
  @IsString()
  @IsOptional()
  reference?: string;

  @IsString()
  @IsOptional()
  notes?: string;
}
