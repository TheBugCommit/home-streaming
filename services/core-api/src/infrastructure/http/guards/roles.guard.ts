import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { RequestWithAuth } from './auth-context';

/** Must run after JwtAuthGuard — requires an admin JWT auth context. */
@Injectable()
export class AdminRolesGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest<RequestWithAuth>();
    if (req.authContext?.type !== 'jwt' || req.authContext.role !== 'admin') {
      throw new ForbiddenException('Admin role required');
    }
    return true;
  }
}
