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
import { ClassConstructor, plainToInstance } from 'class-transformer';
import type { FastifyReply } from 'fastify';
import { I18n, I18nContext } from 'nestjs-i18n';
import { AuthGuard } from './auth.guard';
import { RegistrationGuard } from './registration.guard';
import { ConfigService } from '@nestjs/config';
import { AuthService, RESET_CODE_LIFETIME_MINUTES } from './auth.service';
import { EmailDto } from './dto/email.dto';
import { DeleteAccountDto } from './dto/deleteAccount.dto';
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

/** Passwords never go back into a page: the head script keeps what was typed across a live-validation swap. */
function withoutPasswords<T extends object>(body: T): Partial<T> {
  const rest = { ...body } as Record<string, unknown>;
  for (const key of ['password', 'confirmPassword']) delete rest[key];
  return rest as Partial<T>;
}

/**
 * Live validation runs on every change in the form, so only the fields that
 * hold something are reported: leaving the email field must not list the
 * rules for a password not typed yet. A submit still reports every field.
 */
async function validateTyped<T extends object>(
  i18n: I18nContext,
  dto: ClassConstructor<T>,
  body: T,
) {
  const validationErrors = (
    await i18n.validate(plainToInstance(dto, body))
  ).filter((error) => !!(body as Record<string, unknown>)[error.property]);
  return {
    input: withoutPasswords(body),
    ...(validationErrors.length ? { validationErrors } : {}),
  };
}

@Controller('auth')
export class AuthController {
  private readonly logger = new Logger(AuthController.name);

  constructor(
    private authService: AuthService,
    private readonly configService: ConfigService,
  ) {}

  /**
   * Where a sign-in lands. /auth/profile exists only with accounts on; without
   * them the register and login routes still answer a typed address, so they
   * go to the wardrobe instead of a 404.
   */
  private afterSignIn(): string {
    return this.configService.get<boolean>('AUTH_ENABLED')
      ? '/auth/profile'
      : '/wardrobe';
  }

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
        input: withoutPasswords(body),
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
    return navigate(reply, this.afterSignIn());
  }

  @UseGuards(RegistrationGuard)
  @Render('auth/register')
  @Post('validate/register')
  async postRegisterValidate(
    @I18n() i18n: I18nContext,
    @Body() body: RegisterDto,
  ) {
    return validateTyped(i18n, RegisterDto, body);
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
      return navigate(reply, returnTo ?? this.afterSignIn());
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
  getResetCode(
    @I18n() i18n: I18nContext,
    @Query('email') emailQueryParam: string,
  ): any {
    return {
      // Worded for an address with no account too: the reset form answers
      // both the same way.
      notice: i18n.t('lang.RESET_CODE_SENT', {
        args: { minutes: RESET_CODE_LIFETIME_MINUTES },
      }),
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
    return validateTyped(i18n, ResetPasswordDto, body);
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
        input: withoutPasswords(body),
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
  async getDeleteAccount(@User() payload: Payload): Promise<any> {
    return { username: await this.authService.findEmail(payload.userId) };
  }

  @UseGuards(AuthGuard)
  @Post('delete-account')
  async postDeleteAccount(
    @User() payload: Payload,
    @I18n() i18n: I18nContext,
    @Body() body: DeleteAccountDto,
    @Res() reply: FastifyReply,
  ) {
    try {
      await this.authService.deleteOwnAccount(payload.userId, body.password);
      reply.clearCookie('access_token', { path: '/' });
      return navigate(reply, '/');
    } catch (error) {
      this.logger.warn(error);
      return this.rerender(reply, 'auth/delete-account', {
        error: i18n.t('lang.DELETE_ACCOUNT_FAILED'),
        username: await this.authService.findEmail(payload.userId),
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
    return validateTyped(i18n, UpdateEmailDto, body);
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
