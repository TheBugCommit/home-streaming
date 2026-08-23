import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ApiKey, ApiKeyRepository } from '../../../domain/auth/api-key.entity';

@Injectable()
export class PrismaApiKeyRepository implements ApiKeyRepository {
  constructor(private readonly prisma: PrismaService) {}

  async create(input: {
    ownerUserId: string;
    name: string;
    keyPrefix: string;
    keyHash: string;
    scopes: string[];
  }): Promise<ApiKey> {
    const row = await this.prisma.apiKey.create({
      data: {
        ownerUserId: input.ownerUserId,
        name: input.name,
        keyPrefix: input.keyPrefix,
        keyHash: input.keyHash,
        scopes: input.scopes,
      },
    });
    return this.toDomain(row);
  }

  async findByPrefix(keyPrefix: string): Promise<ApiKey | null> {
    const row = await this.prisma.apiKey.findUnique({ where: { keyPrefix } });
    return row ? this.toDomain(row) : null;
  }

  async findAllByOwner(ownerUserId: string): Promise<ApiKey[]> {
    const rows = await this.prisma.apiKey.findMany({ where: { ownerUserId } });
    return rows.map((row) => this.toDomain(row));
  }

  async revoke(id: string, ownerUserId: string): Promise<void> {
    await this.prisma.apiKey.updateMany({
      where: { id, ownerUserId },
      data: { revokedAt: new Date() },
    });
  }

  async touchLastUsed(id: string): Promise<void> {
    await this.prisma.apiKey.update({
      where: { id },
      data: { lastUsedAt: new Date() },
    });
  }

  private toDomain(row: {
    id: string;
    ownerUserId: string;
    name: string;
    keyPrefix: string;
    keyHash: string;
    scopes: unknown;
    expiresAt: Date | null;
    revokedAt: Date | null;
  }): ApiKey {
    return {
      id: row.id,
      ownerUserId: row.ownerUserId,
      name: row.name,
      keyPrefix: row.keyPrefix,
      keyHash: row.keyHash,
      scopes: Array.isArray(row.scopes) ? (row.scopes as string[]) : [],
      expiresAt: row.expiresAt,
      revokedAt: row.revokedAt,
    };
  }
}
