import { IsDateString, IsOptional, IsString } from 'class-validator';

export class RecordGoodsReturnDto {
  @IsDateString()
  @IsOptional()
  actualReturnDate?: string;

  @IsString()
  @IsOptional()
  notes?: string;
}
