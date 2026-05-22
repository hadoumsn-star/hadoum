import { IsDateString, IsOptional, IsString } from 'class-validator';

export class CreateObservationDto {
  @IsDateString()
  date: string;

  @IsString()
  author: string;

  @IsString()
  behavior: string;

  @IsString()
  @IsOptional()
  groupIntegration?: string;

  @IsString()
  @IsOptional()
  incidents?: string;

  @IsString()
  @IsOptional()
  notes?: string;
}
