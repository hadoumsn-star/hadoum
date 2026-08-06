import { IsNumber, IsOptional, IsString, Min } from 'class-validator';

// PR 12 — physical inventory count. `actualQuantity` is the absolute count
// a director/supervisor physically observed, not a delta — the service
// compares it against the item's current (expected) quantity itself, so the
// caller never computes the variance. `comment` mirrors the "optional
// comment" every other movement type already carries (CreateStock*Dto's
// `reason`).
export class CreateStockInventoryCountDto {
  @IsNumber()
  @Min(0)
  actualQuantity: number;

  @IsString()
  @IsOptional()
  comment?: string;
}
