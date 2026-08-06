import { IsInt, IsString, Min, MinLength } from 'class-validator';

export class CreateFundRequestDto {
  @IsInt()
  @Min(1)
  amountXof: number;

  @IsString()
  @MinLength(1)
  motif: string;
}
