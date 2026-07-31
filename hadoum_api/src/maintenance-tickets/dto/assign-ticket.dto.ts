import { IsString, MinLength } from 'class-validator';

export class AssignTicketDto {
  @IsString()
  @MinLength(1)
  assignedTo: string;
}
