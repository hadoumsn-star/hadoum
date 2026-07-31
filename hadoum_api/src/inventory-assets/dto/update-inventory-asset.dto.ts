import { PartialType } from '@nestjs/mapped-types';
import { AssetStatus } from '@prisma/client';
import { IsEnum, IsOptional } from 'class-validator';
import { CreateInventoryAssetDto } from './create-inventory-asset.dto';

export class UpdateInventoryAssetDto extends PartialType(
  CreateInventoryAssetDto,
) {
  // Only routine transitions (DISPONIBLE / AFFECTE / EN_MAINTENANCE) are
  // accepted here. Loss/theft/damage/reform go through request-disposal;
  // retirement goes through request-archive.
  @IsEnum(AssetStatus)
  @IsOptional()
  status?: AssetStatus;
}
