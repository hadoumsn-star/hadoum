import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { Observable } from 'rxjs';
import { MetricsService } from './metrics.service';
import { RequestWithUser } from '../auth/types/request-with-user';

@Injectable()
export class HttpMetricsInterceptor implements NestInterceptor {
  constructor(private readonly metrics: MetricsService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    if (context.getType() !== 'http') {
      return next.handle();
    }

    const req = context.switchToHttp().getRequest<Request>();
    const res = context.switchToHttp().getResponse<Response>();
    const start = process.hrtime.bigint();

    const record = () => {
      const matchedRoute = req.route as { path?: string } | undefined;
      const route = matchedRoute?.path ?? req.path ?? 'unknown';
      const labels = {
        method: req.method,
        route,
        status_code: String(res.statusCode),
      };
      const seconds = Number(process.hrtime.bigint() - start) / 1e9;
      this.metrics.httpRequestDuration.observe(labels, seconds);
      this.metrics.httpRequestsTotal.inc(labels);
      if (res.statusCode >= 400) {
        this.metrics.httpErrorsTotal.inc(labels);
      }
      const userId = (req as RequestWithUser).user?.id;
      if (userId) this.metrics.recordAuthenticatedUser(userId);
    };

    // 'finish' fires once the response has been sent, whether the request
    // succeeded or an exception filter handled an error - no separate error
    // path needed here.
    res.once('finish', record);

    return next.handle();
  }
}
