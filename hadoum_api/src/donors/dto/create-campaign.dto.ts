import {
  IsDateString,
  IsInt,
  IsOptional,
  IsString,
  Min,
  MinLength,
} from 'class-validator';
import { Type } from 'class-transformer';

// No `status` field — a campaign always starts BROUILLON (the model
// default) and only ever changes status through the dedicated lifecycle
// endpoints (activate/terminate/cancel), never an arbitrary field on
// create/update. See CampaignsService.
export class CreateCampaignDto {
  @IsString()
  @MinLength(1)
  title: string;

  @IsString()
  @IsOptional()
  description?: string;

  // Whole XOF, never a float — same convention as Transaction.amountXof.
  // @Min(1): a 0 or negative target is never created new (see
  // CampaignsService for why the *response* still handles a zero target
  // defensively — legacy/edge-case safety, not something this DTO should
  // ever produce).
  @Type(() => Number)
  @IsInt()
  @Min(1)
  targetAmountXof: number;

  @IsDateString()
  startDate: string;

  @IsDateString()
  @IsOptional()
  endDate?: string;

  @IsString()
  @IsOptional()
  utilizationReport?: string;
}
