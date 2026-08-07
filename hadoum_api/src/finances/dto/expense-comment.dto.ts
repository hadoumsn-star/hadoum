import { IsOptional, IsString } from 'class-validator';

// Optional comment body shared by submit, approve, and resubmit — the three
// PR 5B expense-workflow actions that don't require a comment. Reject is
// the exception (see RejectExpenseDto).
export class ExpenseCommentDto {
  @IsString()
  @IsOptional()
  comment?: string;
}
