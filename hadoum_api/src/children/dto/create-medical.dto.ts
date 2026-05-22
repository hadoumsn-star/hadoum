import { IsDateString, IsOptional, IsString } from 'class-validator';

export class CreateMedicalRecordDto {
  @IsString()
  @IsOptional()
  bloodType?: string;

  @IsString()
  @IsOptional()
  allergies?: string;

  @IsString()
  @IsOptional()
  currentTreatments?: string;

  @IsString()
  @IsOptional()
  vaccinationsText?: string;

  @IsString()
  @IsOptional()
  consultationsText?: string;
}

export class CreateVaccinationDto {
  @IsString()
  name: string;

  @IsDateString()
  date: string;

  @IsDateString()
  @IsOptional()
  nextDueDate?: string;

  @IsString()
  @IsOptional()
  notes?: string;
}

export class CreateConsultationDto {
  @IsDateString()
  date: string;

  @IsString()
  doctor: string;

  @IsString()
  reason: string;

  @IsString()
  @IsOptional()
  prescription?: string;

  @IsString()
  @IsOptional()
  documentUrl?: string;
}
