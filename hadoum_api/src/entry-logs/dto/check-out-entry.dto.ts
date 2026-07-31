import { IsDateString, IsOptional, IsString } from 'class-validator';

export class CheckOutEntryDto {
  @IsDateString()
  @IsOptional()
  actualDepartureDateTime?: string;

  @IsString()
  @IsOptional()
  comment?: string;
}
