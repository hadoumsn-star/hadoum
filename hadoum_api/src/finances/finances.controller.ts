import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  Put,
  Query,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  TransactionType,
  TransactionCategory,
  TransactionStatus,
} from '@prisma/client';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { AuthUser } from '../auth/types/request-with-user';
import { Audited } from '../audit-logs/decorators/audited.decorator';
import { FinancesService } from './finances.service';
import { CreateTransactionDto } from './dto/create-transaction.dto';
import { UpdateTransactionDto } from './dto/update-transaction.dto';
import { UpsertBudgetLineDto } from './dto/upsert-budget-line.dto';
import { ExpenseCommentDto } from './dto/expense-comment.dto';
import { RejectExpenseDto } from './dto/reject-expense.dto';

@Controller('finances')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('DIRECTOR', 'SUPERVISOR')
export class FinancesController {
  constructor(private readonly financesService: FinancesService) {}

  // ─── Transactions ────────────────────────────────────────────────────────

  @Post('transactions')
  @Audited({ module: 'FINANCE', entity: 'Transaction', action: 'CREATE' })
  createTransaction(@Body() dto: CreateTransactionDto) {
    return this.financesService.createTransaction(dto);
  }

  @Get('transactions')
  findAllTransactions(
    @Query('type') type?: TransactionType,
    @Query('category') category?: TransactionCategory,
    @Query('status') status?: TransactionStatus,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    return this.financesService.findAllTransactions({
      type,
      category,
      status,
      from,
      to,
    });
  }

  @Get('dashboard')
  getDashboard(@Query('year') year?: string, @Query('month') month?: string) {
    const now = new Date();
    return this.financesService.getDashboard(
      year ? parseInt(year, 10) : now.getFullYear(),
      month ? parseInt(month, 10) : now.getMonth() + 1,
    );
  }

  @Get('transactions/:id')
  findOneTransaction(@Param('id') id: string) {
    return this.financesService.findOneTransaction(id);
  }

  @Patch('transactions/:id')
  @Audited({ module: 'FINANCE', entity: 'Transaction', action: 'UPDATE' })
  updateTransaction(
    @Param('id') id: string,
    @Body() dto: UpdateTransactionDto,
  ) {
    return this.financesService.updateTransaction(id, dto);
  }

  @Post('transactions/:id/justificatif')
  @UseInterceptors(
    FileInterceptor('file', { limits: { fileSize: 10 * 1024 * 1024 } }),
  )
  uploadJustificatif(
    @Param('id') id: string,
    @UploadedFile() file: Express.Multer.File,
  ) {
    return this.financesService.uploadJustificatif(id, file);
  }

  @Get('transactions/:id/justificatif-url')
  getJustificatifUrl(@Param('id') id: string) {
    return this.financesService.getJustificatifUrl(id);
  }

  // ─── Dedicated expense documents (PR 4) ──────────────────────────────────
  // Additive alongside the justificatif endpoints above, which are
  // unchanged. DEPENSE-only — see FinancesService.assertExpenseTransaction.

  @Post('transactions/:id/purchase-order')
  @UseInterceptors(
    FileInterceptor('file', { limits: { fileSize: 10 * 1024 * 1024 } }),
  )
  uploadPurchaseOrder(
    @Param('id') id: string,
    @UploadedFile() file: Express.Multer.File,
  ) {
    return this.financesService.uploadPurchaseOrder(id, file);
  }

  @Get('transactions/:id/purchase-order-url')
  getPurchaseOrderUrl(@Param('id') id: string) {
    return this.financesService.getPurchaseOrderUrl(id);
  }

  @Delete('transactions/:id/purchase-order')
  deletePurchaseOrder(@Param('id') id: string) {
    return this.financesService.deletePurchaseOrder(id);
  }

  @Post('transactions/:id/invoice')
  @UseInterceptors(
    FileInterceptor('file', { limits: { fileSize: 10 * 1024 * 1024 } }),
  )
  uploadInvoice(
    @Param('id') id: string,
    @UploadedFile() file: Express.Multer.File,
  ) {
    return this.financesService.uploadInvoice(id, file);
  }

  @Get('transactions/:id/invoice-url')
  getInvoiceUrl(@Param('id') id: string) {
    return this.financesService.getInvoiceUrl(id);
  }

  @Delete('transactions/:id/invoice')
  deleteInvoice(@Param('id') id: string) {
    return this.financesService.deleteInvoice(id);
  }

  @Post('transactions/:id/delivery-note')
  @UseInterceptors(
    FileInterceptor('file', { limits: { fileSize: 10 * 1024 * 1024 } }),
  )
  uploadDeliveryNote(
    @Param('id') id: string,
    @UploadedFile() file: Express.Multer.File,
  ) {
    return this.financesService.uploadDeliveryNote(id, file);
  }

  @Get('transactions/:id/delivery-note-url')
  getDeliveryNoteUrl(@Param('id') id: string) {
    return this.financesService.getDeliveryNoteUrl(id);
  }

  @Delete('transactions/:id/delivery-note')
  deleteDeliveryNote(@Param('id') id: string) {
    return this.financesService.deleteDeliveryNote(id);
  }

  @Delete('transactions/:id')
  @HttpCode(204)
  @Audited({ module: 'FINANCE', entity: 'Transaction', action: 'DELETE' })
  deleteTransaction(@Param('id') id: string) {
    return this.financesService.deleteTransaction(id);
  }

  // ─── Expense approval workflow (PR 5A/5B) ────────────────────────────────
  //
  // Transitions + ValidationRequest integration — no notifications, no
  // budget reservation (see ExpenseWorkflowService). Per-method @Roles
  // overrides the class-level DIRECTOR+SUPERVISOR gate above for these six
  // routes specifically; every other route in this controller is untouched.

  @Post('transactions/:id/submit')
  @Roles('DIRECTOR')
  @Audited({ module: 'FINANCE', entity: 'Transaction', action: 'SUBMIT' })
  submitExpense(
    @Param('id') id: string,
    @CurrentUser() user: AuthUser,
    @Body() dto: ExpenseCommentDto,
  ) {
    return this.financesService.submitExpense(id, user.id, dto.comment);
  }

  @Post('transactions/:id/approve')
  @Roles('SUPERVISOR')
  @Audited({ module: 'FINANCE', entity: 'Transaction', action: 'APPROVE' })
  approveExpense(
    @Param('id') id: string,
    @CurrentUser() user: AuthUser,
    @Body() dto: ExpenseCommentDto,
  ) {
    return this.financesService.approveExpense(id, user.id, dto.comment);
  }

  @Post('transactions/:id/reject')
  @Roles('SUPERVISOR')
  @Audited({ module: 'FINANCE', entity: 'Transaction', action: 'REJECT' })
  rejectExpense(
    @Param('id') id: string,
    @CurrentUser() user: AuthUser,
    @Body() dto: RejectExpenseDto,
  ) {
    return this.financesService.rejectExpense(id, user.id, dto.comment);
  }

  @Post('transactions/:id/resubmit')
  @Roles('DIRECTOR')
  @Audited({ module: 'FINANCE', entity: 'Transaction', action: 'RESUBMIT' })
  resubmitExpense(
    @Param('id') id: string,
    @CurrentUser() user: AuthUser,
    @Body() dto: ExpenseCommentDto,
  ) {
    return this.financesService.resubmitExpense(id, user.id, dto.comment);
  }

  @Post('transactions/:id/complete')
  @Roles('DIRECTOR')
  @Audited({ module: 'FINANCE', entity: 'Transaction', action: 'COMPLETE' })
  completeExpense(@Param('id') id: string) {
    return this.financesService.completeExpense(id);
  }

  @Post('transactions/:id/cancel')
  @Roles('DIRECTOR')
  @Audited({ module: 'FINANCE', entity: 'Transaction', action: 'CANCEL' })
  cancelExpense(@Param('id') id: string) {
    return this.financesService.cancelExpense(id);
  }

  // ─── Budget lines ────────────────────────────────────────────────────────
  // Budget editing is SUPERVISOR-only — DIRECTOR keeps full read access to
  // every route above (dashboard, transactions, budget-lines GET) but gets
  // 403 on all three budget-modification routes below. Same per-method
  // @Roles-override convention as the expense-workflow block above; every
  // other route in this controller is untouched.

  @Get('budget-lines')
  findBudgetLines(
    @Query('year') year?: string,
    @Query('month') month?: string,
  ) {
    const now = new Date();
    return this.financesService.findBudgetLines(
      year ? parseInt(year, 10) : now.getFullYear(),
      month ? parseInt(month, 10) : now.getMonth() + 1,
    );
  }

  @Put('budget-lines')
  @Roles('SUPERVISOR')
  @Audited({ module: 'FINANCE', entity: 'BudgetLine', action: 'UPSERT' })
  upsertBudgetLine(@Body() dto: UpsertBudgetLineDto) {
    return this.financesService.upsertBudgetLine(dto);
  }

  // PR 6 — idempotent: creates only the default categories missing for the
  // current month, never overwrites an existing row (default or since
  // edited). Safe to call on every Finance page load — for SUPERVISOR only;
  // DIRECTOR's page load skips this call (see FinancesPage.tsx).
  @Post('budget-lines/ensure-defaults')
  @Roles('SUPERVISOR')
  ensureDefaultBudgetLines() {
    return this.financesService.ensureDefaultBudgetLines();
  }

  @Delete('budget-lines/:id')
  @Roles('SUPERVISOR')
  @HttpCode(204)
  @Audited({ module: 'FINANCE', entity: 'BudgetLine', action: 'DELETE' })
  deleteBudgetLine(@Param('id') id: string) {
    return this.financesService.deleteBudgetLine(id);
  }
}
