import { DocumentType } from '@prisma/client';
import { IsEnum, IsOptional, IsString } from 'class-validator';

export class CreateDocumentDto {
  @IsEnum(DocumentType)
  type: DocumentType;

  @IsString()
  label: string;

  @IsString()
  fileUrl: string;

  @IsString()
  @IsOptional()
  uploadedBy?: string;
}
