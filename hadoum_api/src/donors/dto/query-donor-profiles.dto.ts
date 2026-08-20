import { Transform, Type } from 'class-transformer';
import { DonorType } from '@prisma/client';
import {
  IsBoolean,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

// Same querystring-boolean convention as QueryContactsDto — query params
// arrive as literal "true"/"false" strings (or are absent), so this is
// transformed explicitly rather than relying on `@Type(() => Boolean)`
// (which would coerce any non-empty string, including "false", to `true`).
function parseQueryBoolean({ value }: { value: unknown }): boolean | undefined {
  if (value === undefined) return undefined;
  return value === true || value === 'true';
}

export class QueryDonorProfilesDto {
  @IsOptional()
  @IsEnum(DonorType)
  type?: DonorType;

  // Defaults to `true` (active-only) when the query param is entirely
  // absent — same convention as QueryContactsDto.active.
  @IsOptional()
  @Transform(parseQueryBoolean)
  @IsBoolean()
  active?: boolean = true;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  country?: string;

  // Matches against the linked Contact's identity fields (fullName,
  // organization, phone, email) — DonorProfile itself has no name/contact
  // fields of its own to search.
  @IsOptional()
  @IsString()
  @MaxLength(200)
  search?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  pageSize?: number = 20;
}
