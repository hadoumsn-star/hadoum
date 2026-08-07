import { Injectable, OnModuleDestroy } from '@nestjs/common';
import {
  Registry,
  collectDefaultMetrics,
  Histogram,
  Counter,
  Gauge,
} from 'prom-client';
import { PrismaService } from '../prisma/prisma.service';

// Active-user approximation: JWT auth is stateless, so there is no real
// server-side session list. We track the timestamp of the last authenticated
// request per user id and count how many were seen inside ACTIVE_WINDOW_MS.
// This is a disclosed approximation, not an exact concurrent-session count -
// see docs/monitoring.md.
const ACTIVE_WINDOW_MS = 15 * 60 * 1000;

@Injectable()
export class MetricsService implements OnModuleDestroy {
  readonly registry = new Registry();

  readonly httpRequestDuration: Histogram<'method' | 'route' | 'status_code'>;
  readonly httpRequestsTotal: Counter<'method' | 'route' | 'status_code'>;
  readonly httpErrorsTotal: Counter<'method' | 'route' | 'status_code'>;

  private readonly lastSeenByUser = new Map<string, number>();
  private readonly pruneInterval: NodeJS.Timeout;

  constructor(private readonly prisma: PrismaService) {
    collectDefaultMetrics({ register: this.registry, prefix: 'hadoum_' });

    this.httpRequestDuration = new Histogram({
      name: 'hadoum_http_request_duration_seconds',
      help: 'HTTP request duration in seconds',
      labelNames: ['method', 'route', 'status_code'],
      buckets: [0.01, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10],
      registers: [this.registry],
    });

    this.httpRequestsTotal = new Counter({
      name: 'hadoum_http_requests_total',
      help: 'Total HTTP requests',
      labelNames: ['method', 'route', 'status_code'],
      registers: [this.registry],
    });

    this.httpErrorsTotal = new Counter({
      name: 'hadoum_http_errors_total',
      help: 'Total HTTP requests that resulted in a 4xx/5xx response',
      labelNames: ['method', 'route', 'status_code'],
      registers: [this.registry],
    });

    const lastSeenByUser = this.lastSeenByUser;
    new Gauge({
      name: 'hadoum_active_users',
      help: `Approximate count of distinct authenticated users seen in the last ${ACTIVE_WINDOW_MS / 60000} minutes`,
      registers: [this.registry],
      collect() {
        const cutoff = Date.now() - ACTIVE_WINDOW_MS;
        for (const [userId, lastSeen] of lastSeenByUser) {
          if (lastSeen < cutoff) lastSeenByUser.delete(userId);
        }
        this.set(lastSeenByUser.size);
      },
    });

    new Gauge({
      name: 'hadoum_db_query_latency_seconds',
      help: 'Latency of a lightweight SELECT 1 probe against the database, measured at scrape time',
      registers: [this.registry],
      async collect() {
        const start = process.hrtime.bigint();
        try {
          await prisma.$queryRaw`SELECT 1`;
          const seconds = Number(process.hrtime.bigint() - start) / 1e9;
          this.set(seconds);
        } catch {
          this.set(-1);
        }
      },
    });

    new Gauge({
      name: 'hadoum_notifications_unread_total',
      help: 'Current count of unread notifications across all users',
      registers: [this.registry],
      async collect() {
        try {
          this.set(
            await prisma.notification.count({ where: { isRead: false } }),
          );
        } catch {
          this.set(-1);
        }
      },
    });

    new Gauge({
      name: 'hadoum_validation_queue_pending_total',
      help: 'Current count of validation requests awaiting review',
      registers: [this.registry],
      async collect() {
        try {
          this.set(
            await prisma.validationRequest.count({
              where: { status: 'PENDING_VALIDATION' },
            }),
          );
        } catch {
          this.set(-1);
        }
      },
    });

    new Gauge({
      name: 'hadoum_documents_total',
      help: 'Total uploaded child documents (proxy for upload volume; other modules store attachments outside this table, see docs/monitoring.md)',
      registers: [this.registry],
      async collect() {
        try {
          this.set(await prisma.document.count());
        } catch {
          this.set(-1);
        }
      },
    });

    this.pruneInterval = setInterval(() => {
      const cutoff = Date.now() - ACTIVE_WINDOW_MS;
      for (const [userId, lastSeen] of this.lastSeenByUser) {
        if (lastSeen < cutoff) this.lastSeenByUser.delete(userId);
      }
    }, 60_000);
    this.pruneInterval.unref?.();
  }

  onModuleDestroy() {
    clearInterval(this.pruneInterval);
  }

  recordAuthenticatedUser(userId: string) {
    this.lastSeenByUser.set(userId, Date.now());
  }
}
