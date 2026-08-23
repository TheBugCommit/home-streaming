import { Body, Controller, Delete, Get, Param, Post, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import {
  CreateApiKeyUseCase,
  ListApiKeysUseCase,
  RevokeApiKeyUseCase,
} from '../../../application/api-keys/manage-api-keys.use-case';
import { JwtAuthGuard } from '../guards/jwt-auth.guard';
import { AdminRolesGuard } from '../guards/roles.guard';
import { RequestWithAuth } from '../guards/auth-context';
import { CreateApiKeyDto } from '../dto/api-key.dto';

@ApiTags('api-keys')
@ApiBearerAuth()
@Controller('api-keys')
@UseGuards(JwtAuthGuard, AdminRolesGuard)
export class ApiKeysController {
  constructor(
    private readonly createApiKey: CreateApiKeyUseCase,
    private readonly listApiKeys: ListApiKeysUseCase,
    private readonly revokeApiKey: RevokeApiKeyUseCase,
  ) {}

  @Post()
  async create(@Body() dto: CreateApiKeyDto, @Req() req: RequestWithAuth) {
    const ownerUserId = (req.authContext as { userId: string }).userId;
    const { apiKey, plaintextKey } = await this.createApiKey.execute(
      ownerUserId,
      dto.name,
      dto.scopes ?? ['media:read'],
    );
    // The plaintext key is only ever shown once, at creation time — it's not recoverable afterward.
    return {
      id: apiKey.id,
      name: apiKey.name,
      keyPrefix: apiKey.keyPrefix,
      scopes: apiKey.scopes,
      key: plaintextKey,
    };
  }

  @Get()
  async list(@Req() req: RequestWithAuth) {
    const ownerUserId = (req.authContext as { userId: string }).userId;
    return this.listApiKeys.execute(ownerUserId);
  }

  @Delete(':id')
  async revoke(@Param('id') id: string, @Req() req: RequestWithAuth) {
    const ownerUserId = (req.authContext as { userId: string }).userId;
    await this.revokeApiKey.execute(id, ownerUserId);
    return { status: 'ok' };
  }
}
