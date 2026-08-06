import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import type { App } from 'supertest/types';
import * as bcrypt from 'bcryptjs';
import { AppModule } from '../../src/app.module';
import { PrismaService } from '../../src/prisma/prisma.service';
import { UploadService } from '../../src/upload/upload.service';
import { PrismaExceptionFilter } from '../../src/prisma/prisma-exception.filter';

// Integration/e2e tests never touch real object storage. Every upload
// returns a deterministic fake key/URL instead.
class FakeUploadService {
  upload(file: Express.Multer.File, folder: string): Promise<string> {
    void file;
    return Promise.resolve(
      `${folder}/fake-${Date.now()}-${Math.random().toString(36).slice(2)}.bin`,
    );
  }
  getPresignedUrl(key: string): Promise<string> {
    return Promise.resolve(`https://fake-signed-url.test/${key}`);
  }
  deleteFile(_key: string): Promise<void> {
    void _key;
    return Promise.resolve();
  }
}

export async function createTestApp(): Promise<INestApplication<App>> {
  const moduleRef = await Test.createTestingModule({
    imports: [AppModule],
  })
    .overrideProvider(UploadService)
    .useClass(FakeUploadService)
    .compile();

  const app = moduleRef.createNestApplication<INestApplication<App>>();
  app.setGlobalPrefix('api');
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
  app.useGlobalFilters(new PrismaExceptionFilter());
  await app.init();
  return app;
}

export function getPrisma(app: INestApplication): PrismaService {
  return app.get(PrismaService);
}

// Truncates every table except Prisma's own migration-history table.
// CASCADE handles FK ordering for us, so this doesn't need to know the
// schema's dependency graph.
export async function cleanDatabase(prisma: PrismaService): Promise<void> {
  await prisma.$executeRawUnsafe(`
    DO $$
    DECLARE r RECORD;
    BEGIN
      FOR r IN (
        SELECT tablename FROM pg_tables
        WHERE schemaname = 'public' AND tablename <> '_prisma_migrations'
      ) LOOP
        EXECUTE 'TRUNCATE TABLE ' || quote_ident(r.tablename) || ' CASCADE';
      END LOOP;
    END $$;
  `);
}

export const TEST_PASSWORD = 'Test1234!';

export interface TestUsers {
  director: { id: string; email: string };
  supervisor: { id: string; email: string };
}

export async function seedTestUsers(prisma: PrismaService): Promise<TestUsers> {
  const passwordHash = await bcrypt.hash(TEST_PASSWORD, 10);

  const director = await prisma.user.create({
    data: {
      email: 'director@test.local',
      passwordHash,
      name: 'Test Director',
      initials: 'TD',
      role: 'DIRECTOR',
      roleLabel: 'Directeur',
      title: 'Direction générale',
    },
  });

  const supervisor = await prisma.user.create({
    data: {
      email: 'supervisor@test.local',
      passwordHash,
      name: 'Test Supervisor',
      initials: 'TS',
      role: 'SUPERVISOR',
      roleLabel: 'Superviseur',
      title: 'Supervision & Contrôle',
    },
  });

  return {
    director: { id: director.id, email: director.email },
    supervisor: { id: supervisor.id, email: supervisor.email },
  };
}
