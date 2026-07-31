import { IsOptional, IsString, MinLength } from 'class-validator';

export class AssignInventoryAssetDto {
  @IsString()
  @MinLength(1)
  assignedTo: string;

  @IsString()
  @IsOptional()
  assignedToUserId?: string;

  @IsString()
  @IsOptional()
  spaceId?: string;
}
