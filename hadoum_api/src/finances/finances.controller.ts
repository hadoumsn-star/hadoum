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
import { FinancesService } from './finances.service';
import { CreateTransactionDto } from './dto/create-transaction.dto';
import { UpdateTransactionDto } from './dto/update-transaction.dto';
import { UpsertBudgetLineDto } from './dto/upsert-budget-line.dto';

@Controller('finances')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('DIRECTOR', 'SUPERVISOR')
export class FinancesController {
  constructor(private readonly financesService: FinancesService) {}

  // ─── Transactions ────────────────────────────────────────────────────────

  @Post('transactions')
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

  @Delete('transactions/:id')
  @HttpCode(204)
  deleteTransaction(@Param('id') id: string) {
    return this.financesService.deleteTransaction(id);
  }

  // ─── Budget lines ────────────────────────────────────────────────────────

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
  upsertBudgetLine(@Body() dto: UpsertBudgetLineDto) {
    return this.financesService.upsertBudgetLine(dto);
  }

  @Delete('budget-lines/:id')
  @HttpCode(204)
  deleteBudgetLine(@Param('id') id: string) {
    return this.financesService.deleteBudgetLine(id);
  }
}
