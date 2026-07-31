import { IsOptional, IsString } from 'class-validator';

export class RequestRenewalDto {
  @IsString()
  @IsOptional()
  comment?: string;
}
