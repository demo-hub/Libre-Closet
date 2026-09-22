import { EntityManager } from '@mikro-orm/core';
import { getRepositoryToken } from '@mikro-orm/nestjs';
import { ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { Test, TestingModule } from '@nestjs/testing';
import type { FastifyReply } from 'fastify';
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
