export interface ApiKey {
  id: string;
  ownerUserId: string;
  name: string;
  keyPrefix: string;
  keyHash: string;
  scopes: string[];
  expiresAt: Date | null;
  revokedAt: Date | null;
}

export const API_KEY_REPOSITORY = Symbol('API_KEY_REPOSITORY');

export interface ApiKeyRepository {
  create(input: {
    ownerUserId: string;
    name: string;
    keyPrefix: string;
    keyHash: string;
    scopes: string[];
  }): Promise<ApiKey>;
  findByPrefix(keyPrefix: string): Promise<ApiKey | null>;
  findAllByOwner(ownerUserId: string): Promise<ApiKey[]>;
  revoke(id: string, ownerUserId: string): Promise<void>;
  touchLastUsed(id: string): Promise<void>;
}
