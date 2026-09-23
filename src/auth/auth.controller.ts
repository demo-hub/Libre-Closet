import {
  Body,
  Controller,
  Get,
  Logger,
  Post,
  Query,
  Redirect,
  Render,
  Res,
  UseGuards,
} from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import type { FastifyReply } from 'fastify';
import { I18n, I18nContext } from 'nestjs-i18n';
import { AuthGuard } from './auth.guard';
import { RegistrationGuard } from './registration.guard';
import { AuthService } from './auth.service';
import { EmailDto } from './dto/email.dto';
import { LoginDto } from './dto/login.dto';
import { Payload } from './dto/payload.dto';
import { RegisterDto } from './dto/register.dto';
import { ResetPasswordDto } from './dto/resetPassword.dto';
import { User } from './user.decorator';
import { UpdateEmailDto } from './dto/updateEmail.dto';
import { minutes, seconds, Throttle } from '@nestjs/throttler';
import { safeReturnTo } from './return-to';

/** htmx would follow a 302 inside the request and swap the next page into the form, so it is told to navigate instead. */
function navigate(reply: FastifyReply, url: string) {
  if (!reply.request.headers['hx-request']) return reply.redirect(url, 302);
  reply.header('HX-Redirect', url);
  return reply.send();
}

@Controller('auth')
export class AuthController {
  private readonly logger = new Logger(AuthController.name);

  constructor(private authService: AuthService) {}

  /** @fastify/view merges the request's locals underneath, so ogTitle and friends given here win over the defaults. */
  private rerender(
    reply: FastifyReply,
    view: string,
    data: Record<string, unknown>,
  ) {
    return reply.view(view, { layout: 'layout', ...data });
  }

  @UseGuards(RegistrationGuard)
  @Post('register')
  async postRegister(
    @I18n() i18n: I18nContext,
    @Body() body: RegisterDto,
    @Res() reply: FastifyReply,
  ): Promise<any> {
    const page = {
      ogTitle: i18n.t('lang.REGISTER_OG_TITLE'),
      ogDescription: i18n.t('lang.REGISTER_OG_DESC'),
    };
    const instance = plainToInstance(RegisterDto, body);
    const validationErrors = await i18n.validate(instance);
    if (validationErrors.length) {
      return this.rerender(reply, 'auth/register', {
        ...page,
        input: body,
        validationErrors,
        firstError: validationErrors[0].property,
      });
    }

    let jwt: string;
    try {
      jwt = await this.authService.register(body.email, body.password);
    } catch (error) {
      this.logger.warn(error);
      return this.rerender(reply, 'auth/register', {
        ...page,
        error: i18n.t('lang.REGISTER_FAILED'),
        input: { email: body.email },
      });
    }
    reply.setCookie('access_token', jwt, {
      path: '/',
      maxAge: 365 * 24 * 60 * 60 * 1000, // 365 days
      httpOnly: true, // Prevents client-side JS from reading it
    });
    return navigate(reply, '/auth/profile');
  }

  @UseGuards(RegistrationGuard)
  @Render('auth/register')
  @Post('validate/register')
  async postRegisterValidate(
    @I18n() i18n: I18nContext,
    @Body() body: RegisterDto,
  ) {
    const instance = plainToInstance(RegisterDto, body);
    const validationErrors = await i18n.validate(instance);
    if (validationErrors.length) {
      return {
        input: body,
        validationErrors,
      };
    }

    return { input: body };
  }

  @Throttle({ default: { limit: 5, ttl: seconds(60) } })
  @Post('login')
  async postLogin(
    @I18n() i18n: I18nContext,
    @Body() loginDto: LoginDto & { returnTo?: string | string[] },
    @Res() reply: FastifyReply,
  ) {
    const returnTo = safeReturnTo(
      Array.isArray(loginDto.returnTo)
        ? loginDto.returnTo[0]
        : loginDto.returnTo,
    );
    try {
      const jwt = await this.authService.signIn(
        loginDto.email,
        loginDto.password,
      );
      reply.setCookie('access_token', jwt, {
        path: '/',
        maxAge: 365 * 24 * 60 * 60 * 1000, // 365 days
        httpOnly: true, // Prevents client-side JS from reading it
      });
      return navigate(reply, returnTo ?? '/auth/profile');
    } catch (error) {
      this.logger.warn(error);
      return this.rerender(reply, 'auth/login', {
        ogTitle: i18n.t('lang.LOGIN_OG_TITLE'),
        ogDescription: i18n.t('lang.LOGIN_OG_DESC'),
        error: i18n.t('lang.LOGIN_FAILED'),
        input: { email: loginDto.email },
        // Re-emitted, or a mistyped password loses where they were going.
        returnTo,
      });
    }
  }

  @Redirect('/')
  @Get('logout')
  getLogout(
    // https://docs.nestjs.com/techniques/cookies#use-with-express-default
    @Res({ passthrough: true }) reply: FastifyReply,
  ) {
    reply.clearCookie('access_token', { path: '/' });
  }

  @Get('login')
  @Render('auth/login')
  getLogin(
    @I18n() i18n: I18nContext,
    @Query('returnTo') returnTo: string | undefined,
  ): any {
    return {
      ogTitle: i18n.t('lang.LOGIN_OG_TITLE'),
      ogDescription: i18n.t('lang.LOGIN_OG_DESC'),
      // Validated on the way in as well as on the way out: it is rendered into
      // the form, so it must never be anything but a path on this site.
      returnTo: safeReturnTo(returnTo),
    };
  }

  @Get('reset')
  @Render('auth/reset')
  getReset(@Query('email') emailQueryParam: string): any {
    return {
      input: {
        email: emailQueryParam,
      },
    };
  }

  @Post('reset')
  async postReset(
    @I18n() i18n: I18nContext,
    @Body() emailDto: EmailDto,
    @Res() reply: FastifyReply,
  ) {
    try {
      await this.authService.sendPasswordResetEmail(emailDto.email);
      return navigate(
        reply,
        `/auth/reset-code?email=${encodeURIComponent(emailDto.email)}`,
      );
    } catch (error) {
      this.logger.warn(error);
      return this.rerender(reply, 'auth/reset', {
        error: i18n.t('lang.RESET_FAILED'),
        input: { email: emailDto.email },
      });
    }
  }

  @Get('reset-code')
  @Render('auth/reset-code')
  getResetCode(@Query('email') emailQueryParam: string): any {
    return {
      input: {
        email: emailQueryParam,
      },
    };
  }

  @Render('auth/reset-code')
  @Post('validate/reset-code')
  async postResetCodeValidate(
    @I18n() i18n: I18nContext,
    @Body() body: ResetPasswordDto,
  ) {
    const instance = plainToInstance(ResetPasswordDto, body);
    const validationErrors = await i18n.validate(instance);
    if (validationErrors.length) {
      return {
        input: body,
        validationErrors,
      };
    }

    return { input: body };
  }

  @Throttle({ default: { limit: 5, ttl: minutes(10) } })
  @Post('reset-code')
  async postResetCode(
    @I18n() i18n: I18nContext,
    @Body() body: ResetPasswordDto,
    @Res() reply: FastifyReply,
  ) {
    const instance = plainToInstance(ResetPasswordDto, body);
    const validationErrors = await i18n.validate(instance);
    if (validationErrors.length) {
      return this.rerender(reply, 'auth/reset-code', {
        input: body,
        validationErrors,
        firstError: validationErrors[0].property,
      });
    }

    try {
      await this.authService.resetPassword(body);
    } catch (error) {
      this.logger.warn(error);
      return this.rerender(reply, 'auth/reset-code', {
        error: i18n.t('lang.RESET_CODE_FAILED'),
        input: { email: body.email, resetCode: body.resetCode },
      });
    }
    return navigate(reply, '/auth/login');
  }

  @UseGuards(RegistrationGuard)
  @Get('register')
  @Render('auth/register')
  getRegister(@I18n() i18n: I18nContext): any {
    return {
      ogTitle: i18n.t('lang.REGISTER_OG_TITLE'),
      ogDescription: i18n.t('lang.REGISTER_OG_DESC'),
    };
  }

  @UseGuards(AuthGuard)
  @Get('profile')
  @Render('auth/profile')
  getProfile(): any {}

  @UseGuards(AuthGuard)
  @Get('delete-account')
  @Render('auth/delete-account')
  getDeleteAccount(): any {}

  @UseGuards(AuthGuard)
  @Post('delete-account')
  async postDeleteAccount(
    @User() payload: Payload,
    @I18n() i18n: I18nContext,
    @Body() loginDto: LoginDto,
    @Res() reply: FastifyReply,
  ) {
    try {
      await this.authService.signIn(loginDto.email, loginDto.password);
      await this.authService.deleteUser(payload.userId);
      reply.clearCookie('access_token', { path: '/' });
      return navigate(reply, '/');
    } catch (error) {
      this.logger.warn(error);
      return this.rerender(reply, 'auth/delete-account', {
        error: i18n.t('lang.DELETE_ACCOUNT_FAILED'),
        input: { email: loginDto.email },
      });
    }
  }

  @UseGuards(AuthGuard)
  @Get('update-email')
  @Render('auth/update-email')
  getUpdateEmail() {}

  @Render('auth/update-email')
  @Post('validate/update-email')
  async postValidateUpdateEmail(
    @I18n() i18n: I18nContext,
    @Body() body: UpdateEmailDto,
  ) {
    const instance = plainToInstance(UpdateEmailDto, body);
    const validationErrors = await i18n.validate(instance);
    if (validationErrors.length) {
      return {
        input: body,
        validationErrors,
      };
    }

    return { input: body };
  }

  @UseGuards(AuthGuard)
  @Post('update-email')
  async postUpdateEmail(
    @User() payload: Payload,
    @I18n() i18n: I18nContext,
    @Body() body: UpdateEmailDto,
    @Res() reply: FastifyReply,
  ) {
    const instance = plainToInstance(UpdateEmailDto, body);
    const validationErrors = await i18n.validate(instance);
    if (validationErrors.length) {
      return this.rerender(reply, 'auth/update-email', {
        input: body,
        validationErrors,
        firstError: validationErrors[0].property,
      });
    }

    try {
      await this.authService.changeEmail(payload.userId, body.confirmEmail);
    } catch (error) {
      this.logger.warn(error);
      return this.rerender(reply, 'auth/update-email', {
        error: i18n.t('lang.UPDATE_EMAIL_FAILED'),
        input: body,
      });
    }
    return navigate(reply, '/auth/profile');
  }
}
