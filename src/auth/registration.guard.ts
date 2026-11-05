import {
  CanActivate,
  ExecutionContext,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class RegistrationGuard implements CanActivate {
  constructor(private readonly configService: ConfigService) {}

  canActivate(context: ExecutionContext): boolean {
    if (!this.configService.get<boolean>('AUTH_ENABLED')) {
      throw new NotFoundException();
    }
    if (this.configService.get<boolean>('DISABLE_REGISTRATION')) {
      const response = context.switchToHttp().getResponse();
      response.redirect('/auth/login', 302);
      return false;
    }
    return true;
  }
}
