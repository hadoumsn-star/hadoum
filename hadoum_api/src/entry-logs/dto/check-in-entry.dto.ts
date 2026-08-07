import {
  IsDateString,
  IsInt,
  IsOptional,
  IsString,
  Min,
} from 'class-validator';

export class CheckInEntryDto {
  @IsDateString()
  @IsOptional()
  arrivalDateTime?: string;

  @IsString()
  @IsOptional()
  accessBadgeNumber?: string;

  @IsString()
  @IsOptional()
  vehicleRegistration?: string;

  @IsInt()
  @Min(0)
  @IsOptional()
  accompanyingPersonsCount?: number;

  @IsString()
  @IsOptional()
  comment?: string;
}
