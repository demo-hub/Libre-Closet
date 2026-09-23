import { EntityManager } from '@mikro-orm/core';
import { getRepositoryToken } from '@mikro-orm/nestjs';
import { ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { Test, TestingModule } from '@nestjs/testing';
import type { FastifyReply } from 'fastify';
import { I18nContext } from 'nestjs-i18n';
import { PasswordReset } from '../dal/entity/passwordReset.entity';
import { User } from '../dal/entity/user.entity';
import { EmailService } from '../email/email.service';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { RegistrationGuard } from './registration.guard';

describe('AuthController', () => {
  let controller: AuthController;
  let authService: AuthService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      imports: [
        JwtModule.register({
          secret: 'dummyaccesstoken',
        }),
      ],
      controllers: [AuthController],
      providers: [
        ConfigService,
        AuthService,
        EmailService,
        {
          provide: EntityManager,
          useValue: {
            query: jest.fn(),
          },
        },
        {
          provide: getRepositoryToken(User),
          useValue: {
            findOne: jest.fn(),
            find: jest.fn(),
            persistAndFlush: jest.fn(),
          },
        },
        {
          provide: getRepositoryToken(PasswordReset),
          useValue: {
            findOne: jest.fn(),
            find: jest.fn(),
            persistAndFlush: jest.fn(),
          },
        },
      ],
    }).compile();

    controller = module.get<AuthController>(AuthController);
    authService = module.get<AuthService>(AuthService);
  });

  const i18n = {
    t: (key: string) => key,
    validate: jest.fn().mockResolvedValue([]),
  } as unknown as I18nContext;

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('after a successful submit', () => {
    const replyFor = (headers: Record<string, string>) => ({
      request: { headers },
      header: jest.fn(),
      send: jest.fn(),
      redirect: jest.fn(),
    });

    beforeEach(() => {
      jest
        .spyOn(authService, 'sendPasswordResetEmail')
        .mockResolvedValue(undefined);
    });

    it('tells htmx to navigate, so the next page is not swapped into the form', async () => {
      const reply = replyFor({ 'hx-request': 'true' });
      await controller.postReset(
        i18n,
        { email: 'a+b@example.com' },
        reply as unknown as FastifyReply,
      );
      expect(reply.header).toHaveBeenCalledWith(
        'HX-Redirect',
        '/auth/reset-code?email=a%2Bb%40example.com',
      );
      expect(reply.redirect).not.toHaveBeenCalled();
    });

    it('answers a plain request with a 302', async () => {
      const reply = replyFor({});
      await controller.postReset(
        i18n,
        { email: 'a@example.com' },
        reply as unknown as FastifyReply,
      );
      expect(reply.redirect).toHaveBeenCalledWith(
        '/auth/reset-code?email=a%40example.com',
        302,
      );
      expect(reply.header).not.toHaveBeenCalled();
    });
  });

  describe('after a failed submit', () => {
    const failing = () => ({
      request: { headers: { 'hx-request': 'true' } },
      locals: { ogTitle: 'Libre Closet' },
      view: jest.fn(),
      setCookie: jest.fn(),
      clearCookie: jest.fn(),
      header: jest.fn(),
      send: jest.fn(),
      status: jest.fn(),
    });
    const rendered = (reply: ReturnType<typeof failing>) =>
      reply.view.mock.calls[0] as [string, Record<string, unknown>];

    it('says the login failed, keeps the email and the page title, and never the password', async () => {
      jest.spyOn(authService, 'signIn').mockRejectedValue(new Error('nope'));
      const reply = failing();
      await controller.postLogin(
        i18n,
        { email: 'a@example.com', password: 'secret' },
        reply as unknown as FastifyReply,
      );
      const [view, data] = rendered(reply);
      expect(view).toBe('auth/login');
      expect(data).toMatchObject({
        error: 'lang.LOGIN_FAILED',
        ogTitle: 'lang.LOGIN_OG_TITLE',
        input: { email: 'a@example.com' },
      });
      expect(JSON.stringify(data)).not.toContain('secret');
      expect(reply.setCookie).not.toHaveBeenCalled();
      expect(reply.status).not.toHaveBeenCalled();
    });

    it('says a registration failed rather than forbidding it', async () => {
      jest
        .spyOn(authService, 'register')
        .mockRejectedValue(new Error('exists'));
      const reply = failing();
      await controller.postRegister(
        i18n,
        {
          email: 'a@example.com',
          password: 'Password123!',
          confirmPassword: 'Password123!',
        },
        reply as unknown as FastifyReply,
      );
      expect(rendered(reply)[1]).toMatchObject({
        error: 'lang.REGISTER_FAILED',
        ogTitle: 'lang.REGISTER_OG_TITLE',
        input: { email: 'a@example.com' },
      });
    });

    it('says the reset code was wrong instead of sending the user to log in', async () => {
      jest
        .spyOn(authService, 'resetPassword')
        .mockRejectedValue(new Error('mismatch'));
      const reply = failing();
      await controller.postResetCode(
        i18n,
        {
          email: 'a@example.com',
          resetCode: '123456',
          password: 'Password123!',
          confirmPassword: 'Password123!',
        },
        reply as unknown as FastifyReply,
      );
      expect(rendered(reply)[1]).toMatchObject({
        error: 'lang.RESET_CODE_FAILED',
        input: { email: 'a@example.com', resetCode: '123456' },
      });
      expect(reply.header).not.toHaveBeenCalled();
    });

    it('keeps the account when the confirmation fails', async () => {
      jest.spyOn(authService, 'signIn').mockRejectedValue(new Error('nope'));
      const remove = jest.spyOn(authService, 'deleteUser');
      const reply = failing();
      await controller.postDeleteAccount(
        { userId: 1, email: 'a@example.com' },
        i18n,
        { email: 'a@example.com', password: 'bad' },
        reply as unknown as FastifyReply,
      );
      expect(rendered(reply)[1]).toMatchObject({
        error: 'lang.DELETE_ACCOUNT_FAILED',
      });
      expect(remove).not.toHaveBeenCalled();
      expect(reply.clearCookie).not.toHaveBeenCalled();
    });

    it('throttles the route that checks a reset code, not its live validation', () => {
      const limit = (method: 'postResetCode' | 'postResetCodeValidate') =>
        Reflect.getMetadata('THROTTLER:LIMITdefault', controller[method]);
      expect(limit('postResetCode')).toBe(5);
      expect(limit('postResetCodeValidate')).toBeUndefined();
    });
  });

  describe('RegistrationGuard', () => {
    const guardedMethods = [
      'postRegister',
      'postRegisterValidate',
      'getRegister',
    ];

    guardedMethods.forEach((method) => {
      it(`applies RegistrationGuard to ${method}`, () => {
        const guards: any[] =
          Reflect.getMetadata('__guards__', controller[method]) ?? [];
        const guardTypes = guards.map((g: any) =>
          typeof g === 'function' ? g : g.constructor,
        );
        expect(guardTypes).toContain(RegistrationGuard);
      });
    });
  });
});
