import { Body, Controller, HttpCode, Post } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import {
  AuthenticateUserUseCase,
  LogoutUseCase,
  RefreshTokenUseCase,
} from '../../../application/users/authenticate-user.use-case';
import { LoginDto, RefreshDto } from '../dto/auth.dto';

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(
    private readonly authenticateUser: AuthenticateUserUseCase,
    private readonly refreshTokenUseCase: RefreshTokenUseCase,
    private readonly logoutUseCase: LogoutUseCase,
  ) {}

  @Post('login')
  @HttpCode(200)
  async login(@Body() dto: LoginDto) {
    const { user, tokens } = await this.authenticateUser.execute(dto.email, dto.password);
    return {
      user: { id: user.id, email: user.email, role: user.role },
      ...tokens,
    };
  }

  @Post('refresh')
  @HttpCode(200)
  async refresh(@Body() dto: RefreshDto) {
    return this.refreshTokenUseCase.execute(dto.refreshToken);
  }

  @Post('logout')
  @HttpCode(200)
  async logout(@Body() dto: RefreshDto) {
    await this.logoutUseCase.execute(dto.refreshToken);
    return { status: 'ok' };
  }
}
