import 'dotenv/config';
import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { ValidationPipe, Logger as NestLogger } from '@nestjs/common';
import helmet from 'helmet';
import compression from 'compression';
import { Logger } from 'nestjs-pino';
import { AppModule } from './app.module';
import { PrismaExceptionFilter } from './prisma/prisma-exception.filter';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    bufferLogs: true,
  });
  app.useLogger(app.get(Logger));

  // The app sits behind nginx (see nginx templates / docker-compose.*.yml),
  // which sets X-Forwarded-*. Trusting the first hop lets req.ip and the
  // rate limiter see the real client IP instead of nginx's.
  app.set('trust proxy', 1);

  app.use(helmet());
  app.use(compression());

  app.setGlobalPrefix('api');
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
  app.useGlobalFilters(new PrismaExceptionFilter());

  const frontendUrl = process.env.FRONTEND_URL;
  if (!frontendUrl) {
    new NestLogger('Bootstrap').warn(
      'FRONTEND_URL is not set; falling back to http://localhost:5173 for CORS. Set it explicitly in every deployed environment.',
    );
  }
  app.enableCors({
    origin: (frontendUrl ?? 'http://localhost:5173')
      .split(',')
      .map((s) => s.trim()),
    credentials: false,
  });

  const port = process.env.PORT ?? 3001;
  await app.listen(port);
}

bootstrap().catch((err) => {
  console.error('Fatal error during bootstrap:', err);
  process.exit(1);
});
