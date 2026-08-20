import { IsOptional, IsString, MinLength } from 'class-validator';

// Deliberately just subject/content — not `PartialType(CreateCommunicationDto)`.
// `type`/`direction`/`date`/`donorProfileId` are the hard facts of a logged
// communication (what kind, which way, when, about whom) and stay
// immutable once recorded, same reasoning as UpdateDonationDto locking
// Donation's financial facts. Anything else a caller sends is silently
// stripped by the global ValidationPipe's `whitelist: true`.
export class UpdateCommunicationDto {
  @IsString()
  @MinLength(1)
  @IsOptional()
  subject?: string;

  @IsString()
  @IsOptional()
  content?: string;
}
