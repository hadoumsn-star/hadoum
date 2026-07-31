import { PartialType } from '@nestjs/mapped-types';
import { CreateSupplierContractDto } from './create-supplier-contract.dto';

export class UpdateSupplierContractDto extends PartialType(
  CreateSupplierContractDto,
) {}
