import { config } from 'dotenv';
import { resolve } from 'path';

// Integration/e2e tests always run against the disposable hadoum_test
// database, never the developer's own hadoum_db — this file is loaded by
// Jest (see jest-e2e.json's `setupFiles`) before any test module (and
// therefore before PrismaService/AuthModule, which read process.env at
// construction time) is imported.
config({ path: resolve(__dirname, '../.env.test'), override: true });
