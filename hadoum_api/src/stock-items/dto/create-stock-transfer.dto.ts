import { IsOptional, IsString } from 'class-validator';

export class CreateStockTransferDto {
  @IsString()
  @IsOptional()
  destination?: string;

  @IsString()
  @IsOptional()
  spaceId?: string;

  @IsString()
  @IsOptional()
  reason?: string;
}
