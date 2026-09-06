import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Headers,
  Post,
  Res,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import {
  ApiTags,
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiBody,
} from '@nestjs/swagger';
import { AuthService } from './auth.service.js';
import { JwtAuthGuard } from './guards/jwt-auth.guard.js';
import { RegisterDto } from './dto/register.dto.js';
import { LoginDto } from './dto/login.dto.js';
import { SwitchCompanyDto } from './dto/switch-company.dto.js';
import { VerifyMfaDto } from './dto/verify-2fa.dto.js';
import { LogoutDto } from './dto/logout.dto.js';
import { TokenBlacklistService } from './token-blacklist.service.js';
import { Public } from '../common/decorators/public.decorator.js';
import { GetUser } from '../modules/auth/decorators/get-user.decorator.js';
import { SkipCompanyCheck } from '../common/decorators/skip-company-check.decorator.js';
import { ThrottleEndpoint } from '../common/decorators/throttle-endpoint.decorator.js';
import type { FastifyReply } from 'fastify';

const REFRESH_COOKIE = 'bcost_refresh_token';

interface LogoutUser {
  id: string;
  jti?: string | null;
  exp?: number | null;
}

interface DecodedLogoutToken {
  sub?: string;
  jti?: string;
  exp?: number;
}

@ApiTags('Auth') // Agrupa os endpoints de autenticação no Swagger
@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly jwtService: JwtService,
    private readonly tokenBlacklist: TokenBlacklistService,
  ) {}

  /**
   * ROTA DE SETUP: Cria o administrador inicial.
   * Acesse via navegador: http://localhost:5000/api/auth/setup-admin
   */
  @Public()
  @Get('setup-admin')
  @ThrottleEndpoint({ limit: 1, ttl: 3600 })
  @ApiOperation({ summary: 'Configurar usuário administrador inicial' })
  @ApiResponse({ status: 200, description: 'Admin configurado com sucesso.' })
  @ApiResponse({
    status: 403,
    description: 'Operação não permitida em produção.',
  })
  async setupAdmin() {
    return await this.authService.setupAdmin();
  }

  @Public()
  @Post('register')
  @HttpCode(HttpStatus.CREATED)
  @ThrottleEndpoint({ limit: 5, ttl: 3600 })
  @ApiOperation({ summary: 'Registrar um novo usuário' })
  @ApiBody({ type: RegisterDto, description: 'Dados de registro' })
  @ApiResponse({ status: 201, description: 'Usuário registrado com sucesso.' })
  @ApiResponse({ status: 400, description: 'Dados inválidos.' })
  @ApiResponse({ status: 409, description: 'E-mail já está em uso.' })
  async register(@Body() dto: RegisterDto) {
    return await this.authService.register(dto);
  }

  @Public()
  @Post('login')
  @HttpCode(HttpStatus.OK)
  @ThrottleEndpoint({ limit: 5, ttl: 300 })
  @ApiOperation({ summary: 'Realizar login e obter token JWT' })
  @ApiBody({ type: LoginDto, description: 'Credenciais de acesso' })
  @ApiResponse({ status: 200, description: 'Login realizado com sucesso.' })
  @ApiResponse({
    status: 401,
    description: 'Credenciais inválidas ou usuário inativo.',
  })
  async login(
    @Body() dto: LoginDto,
    @Res({ passthrough: true }) reply: FastifyReply,
  ) {
    return this.attachRefreshCookie(
      await this.authService.login(dto.email, dto.password),
      reply,
    );
  }

  @Public()
  @Post('verify-mfa')
  @ThrottleEndpoint({ limit: 3, ttl: 60 })
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Validar MFA e emitir token JWT definitivo' })
  @ApiBody({ type: VerifyMfaDto, description: 'Sessão MFA e código TOTP' })
  @ApiResponse({ status: 200, description: 'MFA validado com sucesso.' })
  @ApiResponse({ status: 401, description: 'Sessão ou código MFA inválido.' })
  async verifyMfa(
    @Body() dto: VerifyMfaDto,
    @Res({ passthrough: true }) reply: FastifyReply,
  ) {
    return this.attachRefreshCookie(
      await this.authService.verifyMFA(dto.mfaSession, dto.otpCode),
      reply,
    );
  }

  @Public()
  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  @ThrottleEndpoint({ limit: 20, ttl: 60 })
  @ApiOperation({ summary: 'Renovar a sessão autenticada' })
  async refresh(
    @Headers('cookie') cookie: string | undefined,
    @Res({ passthrough: true }) reply: FastifyReply,
  ) {
    const refreshToken = this.readRefreshCookie(cookie);

    if (!refreshToken) {
      throw new BadRequestException({
        message: 'Cookie de renovação ausente.',
        code: 'AUTH-REFRESH-MISSING',
      });
    }

    return this.attachRefreshCookie(
      await this.authService.refresh(refreshToken),
      reply,
    );
  }

  @UseGuards(JwtAuthGuard)
  @Post('logout')
  @HttpCode(HttpStatus.OK)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Revogar sessão JWT atual imediatamente' })
  @ApiBody({ type: LogoutDto, required: false })
  @ApiResponse({ status: 200, description: 'Logout efetuado com sucesso.' })
  @ApiResponse({ status: 400, description: 'Token inválido para revogação.' })
  async logout(
    @GetUser() user: LogoutUser,
    @Headers('authorization') authorization: string | undefined,
    @Body() dto: LogoutDto = {},
    @Res({ passthrough: true }) reply: FastifyReply,
  ) {
    const token = dto.token ?? this.extractBearerToken(authorization);
    const decoded = this.decodeLogoutToken(token);
    const jti = decoded.jti ?? user.jti;
    const exp = decoded.exp ?? user.exp;

    if (!jti || !exp) {
      throw new BadRequestException({
        message: 'Token sem jti/exp não pode ser revogado.',
        code: 'AUTH-LOGOUT-TOKEN-INVALID',
      });
    }

    if (decoded.sub && decoded.sub !== user.id) {
      throw new BadRequestException({
        message: 'Token informado não pertence ao usuário autenticado.',
        code: 'AUTH-LOGOUT-SUBJECT-MISMATCH',
      });
    }

    await this.tokenBlacklist.addToBlacklist(
      jti,
      user.id,
      new Date(exp * 1000),
    );

    reply.header('set-cookie', this.clearRefreshCookie());

    return {
      message: 'Logout efetuado com sucesso.',
      revokedAt: new Date().toISOString(),
    };
  }

  @UseGuards(JwtAuthGuard)
  @Post('logout-all')
  @HttpCode(HttpStatus.OK)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Revogar todas as sessões do usuário' })
  async logoutAll(
    @GetUser('id') userId: string,
    @Res({ passthrough: true }) reply: FastifyReply,
  ) {
    reply.header('set-cookie', this.clearRefreshCookie());
    return this.authService.logoutAll(userId);
  }

  @UseGuards(JwtAuthGuard)
  @Get('me')
  @ApiBearerAuth() // Indica que esta rota requer token JWT
  @ApiOperation({ summary: 'Obter perfil do usuário autenticado' })
  @ApiResponse({ status: 200, description: 'Perfil retornado.' })
  @ApiResponse({ status: 401, description: 'Não autorizado.' })
  getProfile(@GetUser() user: unknown) {
    return user;
  }

  @UseGuards(JwtAuthGuard)
  @Post('switch-company')
  @HttpCode(HttpStatus.OK)
  @SkipCompanyCheck()
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Trocar empresa ativa no token' })
  @ApiBody({ type: SwitchCompanyDto, description: 'Empresa a ser ativada' })
  @ApiResponse({
    status: 200,
    description: 'Token atualizado com a empresa ativa.',
  })
  async switchCompany(
    @GetUser('id') userId: string,
    @Body() dto: SwitchCompanyDto,
  ) {
    return this.authService.switchCompany(userId, dto.companyId);
  }

  private extractBearerToken(authorization: string | undefined): string | null {
    const [type, token] = authorization?.split(' ') ?? [];

    return type === 'Bearer' && token ? token : null;
  }

  private decodeLogoutToken(token: string | null): DecodedLogoutToken {
    if (!token) {
      return {};
    }

    const decoded = this.jwtService.decode(token);

    if (!decoded || typeof decoded === 'string') {
      return {};
    }

    const payload = decoded as Record<string, unknown>;

    return {
      sub: typeof payload.sub === 'string' ? payload.sub : undefined,
      jti: typeof payload.jti === 'string' ? payload.jti : undefined,
      exp: typeof payload.exp === 'number' ? payload.exp : undefined,
    };
  }

  private attachRefreshCookie<T extends object>(
    response: T,
    reply: FastifyReply,
  ): Omit<T, 'refresh_token'> {
    const refreshToken = (response as { refresh_token?: string }).refresh_token;

    if (refreshToken) {
      reply.header('set-cookie', this.serializeRefreshCookie(refreshToken));
    }

    const { refresh_token: _refreshToken, ...publicResponse } = response as T & {
      refresh_token?: string;
    };
    return publicResponse;
  }

  private readRefreshCookie(cookie: string | undefined): string | null {
    const value = cookie
      ?.split(';')
      .map((part) => part.trim())
      .find((part) => part.startsWith(`${REFRESH_COOKIE}=`))
      ?.slice(`${REFRESH_COOKIE}=`.length);

    return value ? decodeURIComponent(value) : null;
  }

  private serializeRefreshCookie(value: string): string {
    const secure = process.env.NODE_ENV === 'production' ? '; Secure' : '';
    return `${REFRESH_COOKIE}=${encodeURIComponent(value)}; Path=/api; HttpOnly; SameSite=Strict; Max-Age=${30 * 24 * 60 * 60}${secure}`;
  }

  private clearRefreshCookie(): string {
    const secure = process.env.NODE_ENV === 'production' ? '; Secure' : '';
    return `${REFRESH_COOKIE}=; Path=/api; HttpOnly; SameSite=Strict; Max-Age=0${secure}`;
  }
}
