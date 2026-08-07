import { Transform, Type } from 'class-transformer';
import {
  IsBoolean,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

// Query-string booleans arrive as the literal strings "true"/"false" (or are
// absent). `@Type(() => Boolean)` would coerce any non-empty string
// (including "false") to `true`, so booleans here are transformed explicitly
// instead of relying on that shortcut.
function parseQueryBoolean({ value }: { value: unknown }): boolean | undefined {
  if (value === undefined) return undefined;
  return value === true || value === 'true';
}

// This is the project's first querystring-bound DTO with pagination — no
// other module has needed one yet (every existing list endpoint takes
// individual `@Query('x')` params with no page/pageSize). Introduced here
// deliberately for Contacts, which is expected to need real pagination as
// the directory grows; existing modules are unaffected.
export class QueryContactsDto {
  @IsOptional()
  @IsString()
  @MaxLength(200)
  search?: string;

  @IsOptional()
  @IsString()
  categoryId?: string;

  // Defaults to `true` (active-only) when the query param is entirely
  // absent. Passing `active=false` explicitly returns inactive contacts
  // only — there is no combined "both" mode in this first implementation.
  @IsOptional()
  @Transform(parseQueryBoolean)
  @IsBoolean()
  active?: boolean = true;

  // Reduced field set for autocomplete-style consumers. See
  // ContactsService.toCompact for the exact shape.
  @IsOptional()
  @Transform(parseQueryBoolean)
  @IsBoolean()
  compact?: boolean = false;

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
