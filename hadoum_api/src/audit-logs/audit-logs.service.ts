import { Injectable, Logger } from '@nestjs/common';
import { AuditModule, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

export interface RecordAuditLogInput {
  module: AuditModule;
  action: string;
  entity: string;
  entityId?: string | null;
  before?: unknown;
  after?: unknown;
  userId?: string | null;
}

export interface FindAllAuditLogsFilters {
  module?: AuditModule;
  userId?: string;
  entity?: string;
  action?: string;
  search?: string;
  dateFrom?: string;
  dateTo?: string;
}

@Injectable()
export class AuditLogsService {
  private readonly logger = new Logger(AuditLogsService.name);

  constructor(private readonly prisma: PrismaService) {}

  // JSON columns reject values Prisma/JS can't serialize as-is (Date objects
  // are fine — JSON.stringify turns them into ISO strings — this guards
  // against anything unexpected, e.g. a future BigInt field, without ever
  // throwing back into the request that triggered the audit write).
  private toJson(value: unknown): Prisma.InputJsonValue | undefined {
    if (value === null || value === undefined) return undefined;
    try {
      return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
    } catch {
      return undefined;
    }
  }

  // Fire-and-forget from the caller's perspective: never throws, so a
  // logging failure can never turn into a 500 on the real request.
  async record(input: RecordAuditLogInput): Promise<void> {
    try {
      await this.prisma.auditLog.create({
        data: {
          module: input.module,
          action: input.action,
          entity: input.entity,
          entityId: input.entityId ?? undefined,
          before: this.toJson(input.before) ?? Prisma.JsonNull,
          after: this.toJson(input.after) ?? Prisma.JsonNull,
          userId: input.userId ?? undefined,
        },
      });
    } catch (error) {
      this.logger.error(
        `Failed to record audit log (${input.module}/${input.entity}/${input.action}): ${(error as Error).message}`,
      );
    }
  }

  findAll(filters: FindAllAuditLogsFilters) {
    const where: Prisma.AuditLogWhereInput = {
      ...(filters.module ? { module: filters.module } : {}),
      ...(filters.userId ? { userId: filters.userId } : {}),
      ...(filters.entity ? { entity: filters.entity } : {}),
      ...(filters.action ? { action: filters.action } : {}),
      ...(filters.dateFrom || filters.dateTo
        ? {
            createdAt: {
              ...(filters.dateFrom ? { gte: new Date(filters.dateFrom) } : {}),
              ...(filters.dateTo ? { lte: new Date(filters.dateTo) } : {}),
            },
          }
        : {}),
      ...(filters.search
        ? {
            OR: [
              {
                entity: {
                  contains: filters.search,
                  mode: Prisma.QueryMode.insensitive,
                },
              },
              {
                action: {
                  contains: filters.search,
                  mode: Prisma.QueryMode.insensitive,
                },
              },
              {
                entityId: {
                  contains: filters.search,
                  mode: Prisma.QueryMode.insensitive,
                },
              },
              {
                user: {
                  is: {
                    name: {
                      contains: filters.search,
                      mode: Prisma.QueryMode.insensitive,
                    },
                  },
                },
              },
            ],
          }
        : {}),
    };

    return this.prisma.auditLog.findMany({
      where,
      include: { user: { select: { id: true, name: true, role: true } } },
      orderBy: { createdAt: 'desc' },
      take: 500,
    });
  }

  // Every known system user, not just ones who already have log entries —
  // keeps the filter dropdown stable/predictable for the director browsing it.
  listUsers() {
    return this.prisma.user.findMany({
      select: { id: true, name: true, role: true },
      orderBy: { name: 'asc' },
    });
  }
}
