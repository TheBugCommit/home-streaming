import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { loadConfig } from '../../../config/configuration';

const INTERNAL_KEY_HEADER = 'x-internal-api-key';

/** Guards /internal/* routes, used only by torrent-worker/transcode-worker/metadata-service. Never publish a host port for these routes. */
@Injectable()
export class InternalKeyGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest();
    const provided = req.headers[INTERNAL_KEY_HEADER];
    const config = loadConfig();

    if (!provided || provided !== config.internalApiKey) {
      throw new UnauthorizedException('Invalid internal API key');
    }
    return true;
  }
}
