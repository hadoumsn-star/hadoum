import { TransactionCategory } from '@prisma/client';
import { IsEnum, IsInt, Max, Min } from 'class-validator';
import { Type } from 'class-transformer';

export class UpsertBudgetLineDto {
  @IsEnum(TransactionCategory)
  category: TransactionCategory;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(12)
  month: number;

  @Type(() => Number)
  @IsInt()
  year: number;

  @Type(() => Number)
  @IsInt()
  @Min(0)
  budgetXof: number;
}
