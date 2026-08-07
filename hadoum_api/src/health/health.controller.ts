import { Controller, Get } from '@nestjs/common';
import { SkipThrottle } from '@nestjs/throttler';
import {
  HealthCheckService,
  HealthCheck,
  HealthIndicatorResult,
  HealthCheckError,
} from '@nestjs/terminus';
import * as fs from 'fs';
import { PrismaService } from '../prisma/prisma.service';

interface PackageJsonShape {
  version?: string;
}

const APP_VERSION: string = (() => {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const pkg = require('../../package.json') as PackageJsonShape;
    return pkg.version ?? 'unknown';
  } catch {
    return 'unknown';
  }
})();

const START_TIME = Date.now();
const DISK_USAGE_WARNING_RATIO = 0.9;

@SkipThrottle()
@Controller('health')
export class HealthController {
  constructor(
    private readonly health: HealthCheckService,
    private readonly prisma: PrismaService,
  ) {}

  @Get()
  @HealthCheck()
  check() {
    return this.health.check([
      () => this.checkDatabase(),
      () => this.checkMigrations(),
      () => this.checkDisk(),
      () => this.checkStorage(),
      () => this.checkMeta(),
    ]);
  }

  private async checkDatabase(): Promise<HealthIndicatorResult> {
    const start = Date.now();
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      return { database: { status: 'up', latencyMs: Date.now() - start } };
    } catch (err) {
      throw new HealthCheckError('Database check failed', {
        database: { status: 'down', message: (err as Error).message },
      });
    }
  }

  private async checkMigrations(): Promise<HealthIndicatorResult> {
    try {
      const rows = await this.prisma.$queryRaw<
        { migration_name: string; finished_at: Date | null }[]
      >`SELECT migration_name, finished_at FROM "_prisma_migrations"
         ORDER BY started_at DESC LIMIT 1`;
      const latest = rows[0];
      if (!latest || latest.finished_at === null) {
        throw new HealthCheckError('Pending or failed migration detected', {
          migrations: {
            status: 'down',
            latest: latest?.migration_name ?? null,
          },
        });
      }
      return { migrations: { status: 'up', latest: latest.migration_name } };
    } catch (err) {
      if (err instanceof HealthCheckError) throw err;
      throw new HealthCheckError('Could not read migration state', {
        migrations: { status: 'down', message: (err as Error).message },
      });
    }
  }

  private checkDisk(): HealthIndicatorResult {
    try {
      const stats = fs.statfsSync('/');
      const totalBytes = stats.blocks * stats.bsize;
      const freeBytes = stats.bfree * stats.bsize;
      const usedRatio = totalBytes > 0 ? 1 - freeBytes / totalBytes : 0;
      if (usedRatio > DISK_USAGE_WARNING_RATIO) {
        throw new HealthCheckError('Disk usage above threshold', {
          disk: { status: 'down', usedRatio: Number(usedRatio.toFixed(3)) },
        });
      }
      return {
        disk: { status: 'up', usedRatio: Number(usedRatio.toFixed(3)) },
      };
    } catch (err) {
      if (err instanceof HealthCheckError) throw err;
      // statfsSync can be unavailable on some platforms (e.g. a bare
      // Windows dev host outside Docker) - don't fail health for that.
      return {
        disk: { status: 'up', note: 'disk usage unavailable on this platform' },
      };
    }
  }

  private checkStorage(): HealthIndicatorResult {
    // Lightweight configuration check, not a live S3 connectivity probe -
    // see docs/monitoring.md for why. Required env vars are enforced by
    // docker-compose.prod.yml/development.yml at container start already.
    const configured = Boolean(
      process.env.S3_ENDPOINT && process.env.S3_BUCKET,
    );
    return { storage: { status: 'up', configured } };
  }

  private checkMeta(): HealthIndicatorResult {
    return {
      meta: {
        status: 'up',
        version: APP_VERSION,
        env: process.env.APP_ENV ?? 'unknown',
        uptimeSeconds: Math.floor((Date.now() - START_TIME) / 1000),
      },
    };
  }
}
