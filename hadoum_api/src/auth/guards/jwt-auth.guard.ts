import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { AuthUser, RequestWithUser } from '../types/request-with-user';

interface JwtPayload {
  sub: string;
  email: string;
  role: AuthUser['role'];
}

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(private readonly jwt: JwtService) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<RequestWithUser>();
    const authHeader = request.headers.authorization;

    if (!authHeader?.startsWith('Bearer ')) {
      throw new UnauthorizedException('Authentification requise.');
    }

    const token = authHeader.slice('Bearer '.length);

    try {
      const payload = this.jwt.verify<JwtPayload>(token);
      request.user = {
        id: payload.sub,
        email: payload.email,
        role: payload.role,
      };
    } catch {
      throw new UnauthorizedException('Session invalide ou expirée.');
    }

    return true;
  }
}
