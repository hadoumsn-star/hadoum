import { IsString, MinLength } from 'class-validator';

export class RejectValidationDto {
  @IsString()
  @MinLength(1)
  comment: string;
}
