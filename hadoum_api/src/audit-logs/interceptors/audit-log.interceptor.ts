import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Observable } from 'rxjs';
import { mergeMap } from 'rxjs/operators';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditLogsService } from '../audit-logs.service';
import { AUDITED_KEY, AuditedMetadata } from '../decorators/audited.decorator';
import type { RequestWithUser } from '../../auth/types/request-with-user';

const MUTATING_METHODS = new Set(['POST', 'PATCH', 'PUT', 'DELETE']);

function lowerFirst(value: string): string {
  return value.length ? value[0].toLowerCase() + value.slice(1) : value;
}

/**
 * Registered once, globally (see app.module.ts's APP_INTERCEPTOR). Only acts
 * on routes carrying @Audited(...) metadata — every other route (including
 * every GET) passes through completely unchanged. Snapshots the entity
 * before the handler runs (for update/delete-style actions) and again after
 * it returns (the handler's own response body), then writes one AuditLog
 * row. Never touches the covered modules' controllers/services beyond the
 * metadata the route already declares, and never lets a logging failure
 * affect the real response (see AuditLogsService.record).
 */
@Injectable()
export class AuditLogInterceptor implements NestInterceptor {
  constructor(
    private readonly reflector: Reflector,
    private readonly prisma: PrismaService,
    private readonly auditLogsService: AuditLogsService,
  ) {}

  async intercept(
    context: ExecutionContext,
    next: CallHandler,
  ): Promise<Observable<unknown>> {
    const meta = this.reflector.get<AuditedMetadata | undefined>(
      AUDITED_KEY,
      context.getHandler(),
    );
    const request = context.switchToHttp().getRequest<RequestWithUser>();

    if (!meta || !MUTATING_METHODS.has(request.method)) {
      return next.handle();
    }

    const idParam = meta.idParam ?? 'id';
    const paramId: string | undefined = (
      request.params as Record<string, string>
    )?.[idParam];
    const prismaModel = lowerFirst(meta.entity) as keyof PrismaService;

    let before: unknown = null;
    if (paramId && meta.action !== 'CREATE') {
      before = await this.snapshot(prismaModel, paramId);
    }

    return next.handle().pipe(
      mergeMap(async (body: unknown) => {
        const responseId =
          body && typeof body === 'object' && 'id' in body
            ? String(body.id)
            : undefined;
        // For CREATE, the freshly-created row's own id (from the response)
        // takes priority — `:id` in the URL, when present at all, names a
        // parent resource (e.g. POST ':id/documents'), not the new row.
        // For every other action, the route's own id param is authoritative.
        const entityId =
          meta.action === 'CREATE'
            ? (responseId ?? paramId ?? null)
            : (paramId ?? responseId ?? null);

        await this.auditLogsService.record({
          module: meta.module,
          action: meta.action,
          entity: meta.entity,
          entityId,
          before,
          after: meta.action === 'DELETE' ? null : (body ?? null),
          userId: request.user?.id ?? null,
        });

        return body;
      }),
    );
  }

  private async snapshot(
    prismaModel: keyof PrismaService,
    id: string,
  ): Promise<unknown> {
    try {
      const delegate = this.prisma[prismaModel] as unknown as {
        findUnique: (args: { where: { id: string } }) => Promise<unknown>;
      };
      return await delegate.findUnique({ where: { id } });
    } catch {
      // Unknown/mistyped entity name, or a model without a plain `id`
      // lookup — never fatal, the audit row is still written without a
      // `before` snapshot.
      return null;
    }
  }
}
