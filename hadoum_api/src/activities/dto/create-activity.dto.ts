import { IsDateString, IsString, MinLength } from 'class-validator';

export class CreateActivityDto {
  @IsString()
  @MinLength(1)
  title: string;

  @IsString()
  @MinLength(1)
  type: string;

  @IsString()
  @MinLength(1)
  className: string;

  @IsString()
  educatorId: string;

  @IsDateString()
  date: string;
}
