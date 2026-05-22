import { IsOptional, IsString } from 'class-validator';

export class CreateEventDto {
  @IsString()
  eventType: string;

  @IsString()
  summary: string;

  @IsString()
  @IsOptional()
  details?: string;

  @IsString()
  @IsOptional()
  author?: string;
}
