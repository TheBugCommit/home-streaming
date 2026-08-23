import { Inject, Injectable } from '@nestjs/common';
import { createHash, randomBytes } from 'crypto';
import {
  API_KEY_REPOSITORY,
  ApiKey,
  ApiKeyRepository,
} from '../../domain/auth/api-key.entity';

const KEY_PREFIX_LENGTH = 8;

export interface CreatedApiKey {
  apiKey: ApiKey;
  plaintextKey: string;
}

@Injectable()
export class CreateApiKeyUseCase {
  constructor(
    @Inject(API_KEY_REPOSITORY) private readonly apiKeys: ApiKeyRepository,
  ) {}

  async execute(ownerUserId: string, name: string, scopes: string[]): Promise<CreatedApiKey> {
    const raw = randomBytes(32).toString('hex');
    const keyPrefix = raw.slice(0, KEY_PREFIX_LENGTH);
    const keyHash = createHash('sha256').update(raw).digest('hex');
    const plaintextKey = `hsk_${raw}`;

    const apiKey = await this.apiKeys.create({
      ownerUserId,
      name,
      keyPrefix,
      keyHash,
      scopes,
    });

    return { apiKey, plaintextKey };
  }
}

@Injectable()
export class ListApiKeysUseCase {
  constructor(
    @Inject(API_KEY_REPOSITORY) private readonly apiKeys: ApiKeyRepository,
  ) {}

  async execute(ownerUserId: string): Promise<ApiKey[]> {
    return this.apiKeys.findAllByOwner(ownerUserId);
  }
}

@Injectable()
export class RevokeApiKeyUseCase {
  constructor(
    @Inject(API_KEY_REPOSITORY) private readonly apiKeys: ApiKeyRepository,
  ) {}

  async execute(id: string, ownerUserId: string): Promise<void> {
    await this.apiKeys.revoke(id, ownerUserId);
  }
}

export function hashApiKeySecret(rawSecretWithoutPrefix: string): string {
  return createHash('sha256').update(rawSecretWithoutPrefix).digest('hex');
}
