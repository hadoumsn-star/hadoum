import { PartialType, OmitType } from '@nestjs/mapped-types';
import { CreateStockItemDto } from './create-stock-item.dto';

export class UpdateStockItemDto extends PartialType(
  OmitType(CreateStockItemDto, ['initialQuantity'] as const),
) {}
