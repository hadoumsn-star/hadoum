import { CallHandler, ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { of } from 'rxjs';
import { AuditLogInterceptor } from './audit-log.interceptor';
import { AuditLogsService } from '../audit-logs.service';
import { PrismaService } from '../../prisma/prisma.service';

// PR 13: generic audit logging — verifies the interceptor's own contract
// (before/after snapshotting, entityId resolution, CREATE vs DELETE vs
// nested-resource handling) in isolation from any real controller.

function createContext(opts: {
  method: string;
  params?: Record<string, string>;
  user?: { id: string } | undefined;
}): ExecutionContext {
  const request = {
    method: opts.method,
    params: opts.params ?? {},
    user: opts.user,
  };
  return {
    switchToHttp: () => ({ getRequest: () => request }),
    getHandler: () => jest.fn(),
  } as unknown as ExecutionContext;
}

function createHandler(body: unknown): CallHandler {
  return { handle: () => of(body) };
}

describe('AuditLogInterceptor', () => {
  let reflector: { get: jest.Mock };
  let prisma: { [key: string]: { findUnique: jest.Mock } };
  let auditLogsService: { record: jest.Mock };
  let interceptor: AuditLogInterceptor;

  beforeEach(() => {
    reflector = { get: jest.fn() };
    prisma = {
      transaction: { findUnique: jest.fn() },
      incident: { findUnique: jest.fn() },
      ticketAttachment: { findUnique: jest.fn() },
    };
    auditLogsService = { record: jest.fn().mockResolvedValue(undefined) };
    interceptor = new AuditLogInterceptor(
      reflector as unknown as Reflector,
      prisma as unknown as PrismaService,
      auditLogsService as unknown as AuditLogsService,
    );
  });

  it('passes through unchanged when no @Audited metadata is present', async () => {
    reflector.get.mockReturnValue(undefined);
    const context = createContext({ method: 'POST' });
    const handler = createHandler({ id: 'x' });

    const result = await interceptor.intercept(context, handler);
    await new Promise((resolve) => result.subscribe(resolve));

    expect(auditLogsService.record).not.toHaveBeenCalled();
  });

  it('passes through unchanged for GET requests even if the route somehow carries metadata', async () => {
    reflector.get.mockReturnValue({
      module: 'FINANCE',
      entity: 'Transaction',
      action: 'CREATE',
    });
    const context = createContext({ method: 'GET' });
    const handler = createHandler({ id: 'x' });

    await interceptor.intercept(context, handler);

    expect(auditLogsService.record).not.toHaveBeenCalled();
  });

  it('CREATE: does not snapshot "before" and takes entityId from the response body', async () => {
    reflector.get.mockReturnValue({
      module: 'FINANCE',
      entity: 'Transaction',
      action: 'CREATE',
    });
    const context = createContext({ method: 'POST', user: { id: 'user-1' } });
    const handler = createHandler({ id: 'tx-1', label: 'Achat' });

    const result = await interceptor.intercept(context, handler);
    await new Promise((resolve) => result.subscribe(resolve));

    expect(prisma.transaction.findUnique).not.toHaveBeenCalled();
    expect(auditLogsService.record).toHaveBeenCalledWith(
      expect.objectContaining({
        module: 'FINANCE',
        entity: 'Transaction',
        action: 'CREATE',
        entityId: 'tx-1',
        before: null,
        after: { id: 'tx-1', label: 'Achat' },
        userId: 'user-1',
      }),
    );
  });

  it('UPDATE: snapshots "before" via the entity-derived Prisma model before the handler runs', async () => {
    reflector.get.mockReturnValue({
      module: 'INCIDENTS',
      entity: 'Incident',
      action: 'UPDATE',
    });
    prisma.incident.findUnique.mockResolvedValue({
      id: 'inc-1',
      title: 'Old title',
    });
    const context = createContext({
      method: 'PATCH',
      params: { id: 'inc-1' },
      user: { id: 'user-1' },
    });
    const handler = createHandler({ id: 'inc-1', title: 'New title' });

    const result = await interceptor.intercept(context, handler);
    await new Promise((resolve) => result.subscribe(resolve));

    expect(prisma.incident.findUnique).toHaveBeenCalledWith({
      where: { id: 'inc-1' },
    });
    expect(auditLogsService.record).toHaveBeenCalledWith(
      expect.objectContaining({
        entityId: 'inc-1',
        before: { id: 'inc-1', title: 'Old title' },
        after: { id: 'inc-1', title: 'New title' },
      }),
    );
  });

  it('DELETE: forces `after` to null regardless of the (typically empty) response body', async () => {
    reflector.get.mockReturnValue({
      module: 'INCIDENTS',
      entity: 'Incident',
      action: 'DELETE',
    });
    prisma.incident.findUnique.mockResolvedValue({ id: 'inc-1' });
    const context = createContext({
      method: 'DELETE',
      params: { id: 'inc-1' },
      user: { id: 'user-1' },
    });
    const handler = createHandler(undefined);

    const result = await interceptor.intercept(context, handler);
    await new Promise((resolve) => result.subscribe(resolve));

    expect(auditLogsService.record).toHaveBeenCalledWith(
      expect.objectContaining({ entityId: 'inc-1', after: null }),
    );
  });

  it('uses a custom idParam for a nested sub-resource route', async () => {
    reflector.get.mockReturnValue({
      module: 'MAINTENANCE',
      entity: 'TicketAttachment',
      action: 'DELETE',
      idParam: 'attachmentId',
    });
    prisma.ticketAttachment.findUnique.mockResolvedValue({ id: 'att-1' });
    const context = createContext({
      method: 'DELETE',
      params: { id: 'ticket-1', attachmentId: 'att-1' },
      user: { id: 'user-1' },
    });
    const handler = createHandler(undefined);

    const result = await interceptor.intercept(context, handler);
    await new Promise((resolve) => result.subscribe(resolve));

    expect(prisma.ticketAttachment.findUnique).toHaveBeenCalledWith({
      where: { id: 'att-1' },
    });
    expect(auditLogsService.record).toHaveBeenCalledWith(
      expect.objectContaining({ entityId: 'att-1' }),
    );
  });

  it('records without a user when the request has none', async () => {
    reflector.get.mockReturnValue({
      module: 'FINANCE',
      entity: 'Transaction',
      action: 'CREATE',
    });
    const context = createContext({ method: 'POST' });
    const handler = createHandler({ id: 'tx-1' });

    const result = await interceptor.intercept(context, handler);
    await new Promise((resolve) => result.subscribe(resolve));

    expect(auditLogsService.record).toHaveBeenCalledWith(
      expect.objectContaining({ userId: null }),
    );
  });
});
