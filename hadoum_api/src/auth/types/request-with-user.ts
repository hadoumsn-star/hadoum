import { Request } from 'express';
import { UserRole } from '@prisma/client';

export interface AuthUser {
  id: string;
  email: string;
  role: UserRole;
}

export interface RequestWithUser extends Request {
  user: AuthUser;
}
