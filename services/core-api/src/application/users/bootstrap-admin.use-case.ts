import { Inject, Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import * as argon2 from 'argon2';
import { USER_REPOSITORY, UserRepository } from '../../domain/users/user.entity';
import { loadConfig } from '../../config/configuration';

@Injectable()
export class BootstrapAdminUseCase implements OnApplicationBootstrap {
  private readonly logger = new Logger(BootstrapAdminUseCase.name);

  constructor(@Inject(USER_REPOSITORY) private readonly users: UserRepository) {}

  async onApplicationBootstrap(): Promise<void> {
    const config = loadConfig();
    const existing = await this.users.findByEmail(config.adminEmail);
    if (existing) {
      return;
    }

    const passwordHash = await argon2.hash(config.adminInitialPassword);
    await this.users.create({
      email: config.adminEmail,
      passwordHash,
      displayName: 'Administrator',
      role: 'admin',
    });
    this.logger.log(`Bootstrapped initial admin user ${config.adminEmail}`);
  }
}
