import { IsOptional, IsString } from 'class-validator';

export class RequestTerminationDto {
  @IsString()
  @IsOptional()
  comment?: string;
}
