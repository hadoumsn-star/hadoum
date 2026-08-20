import { PartialType } from '@nestjs/mapped-types';
import { CreateCampaignDto } from './create-campaign.dto';

// PartialType is safe here (unlike UpdateDonorProfileDto) — CreateCampaignDto
// has no field this endpoint needs to exclude. `status` was never on
// CreateCampaignDto in the first place, so it can't leak in here either;
// status changes only ever go through the lifecycle endpoints (see
// CampaignsController).
export class UpdateCampaignDto extends PartialType(CreateCampaignDto) {}
