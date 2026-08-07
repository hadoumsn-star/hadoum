import { IsIn, IsOptional, IsString, MinLength } from 'class-validator';

export class RequestAssetDisposalDto {
  @IsIn(['PERTE', 'VOL', 'CASSE', 'REFORME'])
  disposalType: 'PERTE' | 'VOL' | 'CASSE' | 'REFORME';

  @IsString()
  @MinLength(1)
  reason: string;

  @IsString()
  @IsOptional()
  comment?: string;
}
