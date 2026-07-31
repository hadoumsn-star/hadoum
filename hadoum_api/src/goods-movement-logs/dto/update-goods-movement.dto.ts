import { PartialType } from '@nestjs/mapped-types';
import { CreateGoodsMovementDto } from './create-goods-movement.dto';

export class UpdateGoodsMovementDto extends PartialType(
  CreateGoodsMovementDto,
) {}
