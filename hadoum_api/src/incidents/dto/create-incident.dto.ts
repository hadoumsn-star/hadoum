import { IncidentType } from '@prisma/client';
import { IsDateString, IsEnum, IsOptional, IsString, MinLength } from 'class-validator';

export class CreateIncidentDto {
  @IsString()
  @MinLength(1)
  title: string;

  @IsEnum(IncidentType)
  type: IncidentType;

  @IsString()
  @IsOptional()
  description?: string;

  @IsString()
  signaledBy: string;

  @IsDateString()
  @IsOptional()
  date?: string;
}
