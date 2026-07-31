import { IsOptional, IsString } from 'class-validator';

export class SubmitValidationDto {
  @IsString()
  @IsOptional()
  comment?: string;
}
