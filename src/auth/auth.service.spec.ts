import { EntityManager } from '@mikro-orm/core';
import { getRepositoryToken } from '@mikro-orm/nestjs';
import { ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { Test, TestingModule } from '@nestjs/testing';
import { PasswordReset } from '../dal/entity/passwordReset.entity';
import { User } from '../dal/entity/user.entity';
import { EmailService } from '../email/email.service';
import { UnauthorizedException } from '@nestjs/common';
import * as bcrypt from 'bcryptjs';
import { AuthService } from './auth.service';

describe('AuthService', () => {
  let service: AuthService;
  let module: TestingModule;

  beforeEach(async () => {
    module = await Test.createTestingModule({
      imports: [
        JwtModule.register({
          secret: 'dummyaccesstoken',
        }),
      ],
      providers: [
        AuthService,
        {
          provide: ConfigService,
          useValue: new ConfigService({ APP_NAME: 'Libre Closet' }),
        },
        EmailService,
        {
          provide: getRepositoryToken(User),
          useValue: {
            findOneOrFail: jest.fn(),
            findOne: jest.fn(),
            find: jest.fn(),
            persistAndFlush: jest.fn(),
          },
        },
        {
          provide: getRepositoryToken(PasswordReset),
          useValue: {
            create: jest.fn((reset: object) => reset),
            findOne: jest.fn(),
            find: jest.fn(),
            persistAndFlush: jest.fn(),
          },
        },
        {
          provide: EntityManager,
          useValue: {
            query: jest.fn(),
            persistAndFlush: jest.fn(),
            // you can mock other functions inside
            // the entity manager object, my case only needed query method
          },
        },
      ],
    }).compile();

    service = module.get<AuthService>(AuthService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('resetPassword', () => {
    const request = {
      email: 'a@example.com',
      resetCode: '000000',
      password: 'Password123!',
      confirmPassword: 'Password123!',
    };
    const flush = () =>
      module.get<{ persistAndFlush: jest.Mock }>(EntityManager).persistAndFlush;
    const userWith = (reset: { pin: string } | null | undefined) => ({
      password: 'old-hash',
      passwordReset:
        reset === undefined
          ? undefined
          : { load: () => Promise.resolve(reset) },
    });

    it.each([
      ['a wrong code', { pin: '654321' }],
      ['no code at all', null],
      ['a user who never asked for one', undefined],
    ])('refuses %s and changes nothing', async (_, reset) => {
      const user = userWith(reset);
      module
        .get(getRepositoryToken(User))
        .findOneOrFail.mockResolvedValue(user);
      await expect(service.resetPassword(request)).rejects.toBeInstanceOf(
        UnauthorizedException,
      );
      expect(flush()).not.toHaveBeenCalled();
      expect(user.password).toBe('old-hash');
    });

    it('sets the new password when the code matches', async () => {
      const user = userWith({ pin: '000000' });
      module
        .get(getRepositoryToken(User))
        .findOneOrFail.mockResolvedValue(user);
      await service.resetPassword(request);
      expect(flush()).toHaveBeenCalledWith(user);
      expect(await bcrypt.compare('Password123!', user.password)).toBe(true);
    });
  });

  describe('sendPasswordResetEmail', () => {
    it('names the app and gives the code, but never the address', async () => {
      const user = { email: 'someone@example.com' };
      module
        .get(getRepositoryToken(User))
        .findOneOrFail.mockResolvedValue(user);
      const send = jest
        .spyOn(module.get(EmailService), 'sendEmailFromPrimaryAddress')
        .mockResolvedValue('message-id');

      await service.sendPasswordResetEmail(user.email);

      const [[stored]] = module.get(getRepositoryToken(PasswordReset)).create
        .mock.calls as [[{ pin: string }]];
      expect(stored.pin).toMatch(/^\d{6}$/);
      const [[{ to, subject, text, html }]] = send.mock.calls;
      expect(to).toBe(user.email);
      expect(subject).toBe('Libre Closet: password reset code');
      expect(text).toBe(
        `Hello. Use this code to reset your Libre Closet password: ${stored.pin}. If you did not ask for a reset, ignore this email.`,
      );
      expect(html).toContain('<html lang="en">');
      expect(html).toContain('<title>Libre Closet password reset</title>');
      expect(html).toContain(
        `<p>Hello. Use this code to reset your Libre Closet password: <strong>${stored.pin}</strong>. If you did not ask for a reset, ignore this email.</p>`,
      );
      expect(`${subject} ${text} ${html}`).not.toContain(user.email);
    });
  });
});
