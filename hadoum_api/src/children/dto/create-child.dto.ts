import { ChildStatus, Gender } from '@prisma/client';
import {
  IsDateString,
  IsEnum,
  IsOptional,
  IsString,
} from 'class-validator';

export class CreateChildDto {
  @IsString()
  firstName: string;

  @IsString()
  lastName: string;

  @IsDateString()
  dateOfBirth: string;

  @IsString()
  placeOfBirth: string;

  @IsEnum(Gender)
  gender: Gender;

  @IsDateString()
  entryDate: string;

  @IsEnum(ChildStatus)
  status: ChildStatus;

  @IsString()
  @IsOptional()
  guardianName?: string;

  @IsString()
  @IsOptional()
  guardianPhone?: string;

  @IsString()
  @IsOptional()
  guardianRelation?: string;

  @IsOptional()
  emergencyContacts?: object;

  @IsString()
  @IsOptional()
  familyComposition?: string;

  @IsString()
  @IsOptional()
  placementHistory?: string;

  @IsOptional()
  familyContacts?: object;
}
