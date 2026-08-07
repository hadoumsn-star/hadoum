import { IsOptional, IsString } from 'class-validator';

export class CancelEntryDto {
  @IsString()
  @IsOptional()
  reason?: string;
}
