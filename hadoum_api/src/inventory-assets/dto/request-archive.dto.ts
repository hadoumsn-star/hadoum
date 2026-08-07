import { IsOptional, IsString } from 'class-validator';

export class RequestArchiveDto {
  @IsString()
  @IsOptional()
  comment?: string;
}
