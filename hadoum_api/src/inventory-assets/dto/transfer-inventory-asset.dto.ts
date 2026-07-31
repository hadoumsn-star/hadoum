import { IsOptional, IsString } from 'class-validator';

export class TransferInventoryAssetDto {
  @IsString()
  @IsOptional()
  spaceId?: string;

  @IsString()
  @IsOptional()
  assignedTo?: string;

  @IsString()
  @IsOptional()
  reason?: string;

  // Only used when the transfer turns out to be sensitive (high value) and
  // is routed through the validation workflow instead of applied directly.
  @IsString()
  @IsOptional()
  comment?: string;
}
