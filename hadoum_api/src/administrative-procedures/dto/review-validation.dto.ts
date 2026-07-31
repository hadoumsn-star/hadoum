import { IsOptional, IsString } from 'class-validator';

export class ReviewValidationDto {
  @IsString()
  @IsOptional()
  comment?: string;
}
