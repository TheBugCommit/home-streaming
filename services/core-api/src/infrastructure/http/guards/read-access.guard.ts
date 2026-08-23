import {
  CanActivate,
  ExecutionContext,
  Inject,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { createHash } from 'crypto';
import { loadConfig } from '../../../config/configuration';
import {
  API_KEY_REPOSITORY,
  ApiKeyRepository,
} from '../../../domain/auth/api-key.entity';
import { RequestWithAuth } from './auth-context';

const API_KEY_HEADER = 'x-api-key';

/**
 * Read-only public endpoints accept either a session JWT or a machine API key.
 * Guard order: try JWT first (cheap, no DB hit), fall back to API key (one lookup + hash compare).
 */
@Injectable()
export class ReadAccessGuard implements CanActivate {
  constructor(
    private readonly jwtService: JwtService,
    @Inject(API_KEY_REPOSITORY) private readonly apiKeys: ApiKeyRepository,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<RequestWithAuth>();
    const authHeader = req.headers.authorization;
    const apiKeyHeader = req.headers[API_KEY_HEADER] as string | undefined;

    if (authHeader?.startsWith('Bearer ')) {
      const config = loadConfig();
      try {
        const payload = this.jwtService.verify<{ sub: string; email: string; role: 'admin' | 'viewer' }>(
          authHeader.slice('Bearer '.length),
          { secret: config.jwtAccessSecret },
        );
        req.authContext = {
          type: 'jwt',
          userId: payload.sub,
          email: payload.email,
          role: payload.role,
        };
        return true;
      } catch {
        throw new UnauthorizedException('Invalid or expired access token');
      }
    }

    if (apiKeyHeader) {
      const raw = apiKeyHeader.startsWith('hsk_') ? apiKeyHeader.slice(4) : apiKeyHeader;
      const keyPrefix = raw.slice(0, 8);
      const keyHash = createHash('sha256').update(raw).digest('hex');

      const found = await this.apiKeys.findByPrefix(keyPrefix);
      if (!found || found.revokedAt || found.keyHash !== keyHash) {
        throw new UnauthorizedException('Invalid API key');
      }
      if (found.expiresAt && found.expiresAt < new Date()) {
        throw new UnauthorizedException('Expired API key');
      }

      await this.apiKeys.touchLastUsed(found.id);
      req.authContext = {
        type: 'apiKey',
        apiKeyId: found.id,
        ownerUserId: found.ownerUserId,
        scopes: found.scopes,
      };
      return true;
    }

    throw new UnauthorizedException('Provide either a Bearer access token or an X-Api-Key header');
  }
}
