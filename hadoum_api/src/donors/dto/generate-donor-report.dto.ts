import { IsOptional, IsString } from 'class-validator';

// Optional — lets the Director add/update the narrative right before
// generating, without a separate PATCH round-trip. Omitted entirely keeps
// whatever activitiesNarrative the report already has (set at creation, or
// from a prior generate() call).
export class GenerateDonorReportDto {
  @IsString()
  @IsOptional()
  activitiesNarrative?: string;
}
