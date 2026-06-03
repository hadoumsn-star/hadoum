import { PartialType } from '@nestjs/mapped-types';
import { IsDateString, IsOptional } from 'class-validator';
import { CreateChildDto } from './create-child.dto';

export class UpdateChildDto extends PartialType(CreateChildDto) {
  @IsDateString()
  @IsOptional()
  exitReturnDate?: string;

  @IsDateString()
  @IsOptional()
  exitDate?: string;
}
