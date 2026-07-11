import {
  Body,
  Controller,
  Get,
  Post,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
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
import { Public } from '../common/decorators/public.decorator.js';
import { GetUser } from '../modules/auth/decorators/get-user.decorator.js';
import { SkipCompanyCheck } from '../common/decorators/skip-company-check.decorator.js';

@ApiTags('Auth') // Agrupa os endpoints de autenticação no Swagger
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  /**
   * ROTA DE SETUP: Cria o administrador inicial.
   * Acesse via navegador: http://localhost:5000/api/auth/setup-admin
   */
  @Public()
  @Get('setup-admin')
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
  @ApiOperation({ summary: 'Realizar login e obter token JWT' })
  @ApiBody({ type: LoginDto, description: 'Credenciais de acesso' })
  @ApiResponse({ status: 200, description: 'Login realizado com sucesso.' })
  @ApiResponse({
    status: 401,
    description: 'Credenciais inválidas ou usuário inativo.',
  })
  async login(@Body() dto: LoginDto) {
    return await this.authService.login(dto.email, dto.password);
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
}
