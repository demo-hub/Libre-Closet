import { EntityManager } from '@mikro-orm/core';
import { getRepositoryToken } from '@mikro-orm/nestjs';
import { ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { Test, TestingModule } from '@nestjs/testing';
import { PasswordReset } from '../dal/entity/passwordReset.entity';
import { User } from '../dal/entity/user.entity';
import { EmailService } from '../email/email.service';
import { Logger, UnauthorizedException } from '@nestjs/common';
import * as bcrypt from 'bcryptjs';
import {
  AuthService,
  isResetCodeCurrent,
  RESET_CODE_LIFETIME_MINUTES,
} from './auth.service';

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
            removeAndFlush: jest.fn(),
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

  const em = () =>
    module.get<{ persistAndFlush: jest.Mock; removeAndFlush: jest.Mock }>(
      EntityManager,
    );
  const minutesAgo = (n: number) => new Date(Date.now() - n * 60 * 1000);

  describe('isResetCodeCurrent', () => {
    const now = new Date('2026-10-15T12:00:00Z');
    const at = (ms: number) => ({ createdAt: new Date(now.getTime() - ms) });
    const lifetime = RESET_CODE_LIFETIME_MINUTES * 60 * 1000;

    it('accepts a code up to its lifetime', () => {
      expect(isResetCodeCurrent(at(0), now)).toBe(true);
      expect(isResetCodeCurrent(at(lifetime), now)).toBe(true);
    });

    it.each<[string, { createdAt?: Date }]>([
      ['one past its lifetime', at(lifetime + 1)],
      ['one from the future', at(-1)],
      ['one with no time, kept from before codes expired', {}],
    ])('refuses %s', (_, reset) => {
      expect(isResetCodeCurrent(reset, now)).toBe(false);
    });
  });

  describe('resetPassword', () => {
    const request = {
      email: 'a@example.com',
      resetCode: '000000',
      password: 'Password123!',
      confirmPassword: 'Password123!',
    };
    const userWith = (
      reset: { pin: string; createdAt?: Date } | null | undefined,
    ) => ({
      password: 'old-hash',
      passwordReset:
        reset === undefined
          ? undefined
          : ({ load: () => Promise.resolve(reset) } as unknown),
    });

    it.each<[string, { pin: string; createdAt?: Date } | null | undefined]>([
      ['a wrong code', { pin: '654321', createdAt: minutesAgo(1) }],
      ['an expired code', { pin: '000000', createdAt: minutesAgo(16) }],
      ['a code with no time', { pin: '000000' }],
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
      expect(em().persistAndFlush).not.toHaveBeenCalled();
      expect(em().removeAndFlush).not.toHaveBeenCalled();
      expect(user.password).toBe('old-hash');
    });

    it('sets the new password and deletes the code, unlinking it first', async () => {
      const reset = { pin: '000000', createdAt: minutesAgo(14) };
      const user = userWith(reset);
      module
        .get(getRepositoryToken(User))
        .findOneOrFail.mockResolvedValue(user);
      await service.resetPassword(request);
      expect(await bcrypt.compare('Password123!', user.password)).toBe(true);
      expect(user.passwordReset).toBeNull();
      expect(em().persistAndFlush).toHaveBeenCalledWith(user);
      expect(em().removeAndFlush).toHaveBeenCalledWith(reset);
      // The user must stop pointing at the code before it is deleted: the
      // foreign key cascades, so the other order deletes the user.
      expect(em().persistAndFlush.mock.invocationCallOrder[0]).toBeLessThan(
        em().removeAndFlush.mock.invocationCallOrder[0],
      );
    });
  });

  describe('sendPasswordResetEmail', () => {
    const users = () => module.get(getRepositoryToken(User));
    const resets = () => module.get(getRepositoryToken(PasswordReset));
    let send: jest.SpyInstance;
    let configured: jest.SpyInstance;

    beforeEach(() => {
      send = jest
        .spyOn(module.get(EmailService), 'sendEmailFromPrimaryAddress')
        .mockResolvedValue('message-id');
      configured = jest
        .spyOn(module.get(EmailService), 'isConfigured', 'get')
        .mockReturnValue(true);
    });

    it('names the app, gives the code and its lifetime, but never the address', async () => {
      const user = { email: 'someone@example.com' };
      users().findOne.mockResolvedValue(user);

      await service.sendPasswordResetEmail(user.email);

      const [[stored]] = resets().create.mock.calls as [[{ pin: string }]];
      expect(stored.pin).toMatch(/^\d{6}$/);
      const [[{ to, subject, text, html }]] = send.mock.calls;
      expect(to).toBe(user.email);
      expect(subject).toBe('Libre Closet: password reset code');
      expect(text).toBe(
        `Hello. Use this code to reset your Libre Closet password: ${stored.pin}. It works for 15 minutes. If you did not ask for a reset, ignore this email.`,
      );
      expect(html).toContain('<html lang="en">');
      expect(html).toContain('<title>Libre Closet password reset</title>');
      expect(html).toContain(
        `<p>Hello. Use this code to reset your Libre Closet password: <strong>${stored.pin}</strong>. It works for 15 minutes. If you did not ask for a reset, ignore this email.</p>`,
      );
      expect(`${subject} ${text} ${html}`).not.toContain(user.email);
    });

    it('answers an address with no account as it answers one with, and sends nothing', async () => {
      users().findOne.mockResolvedValue(null);
      await expect(
        service.sendPasswordResetEmail('nobody@example.com'),
      ).resolves.toBeUndefined();
      expect(resets().create).not.toHaveBeenCalled();
      expect(send).not.toHaveBeenCalled();
    });

    it('replaces an earlier code, deleting it only after the user points at the new one', async () => {
      const previous = { pin: '111111' };
      const user = {
        email: 'someone@example.com',
        passwordReset: { load: () => Promise.resolve(previous) } as unknown,
      };
      users().findOne.mockResolvedValue(user);

      await service.sendPasswordResetEmail(user.email);

      const [[stored]] = resets().create.mock.calls as [[{ pin: string }]];
      expect((user.passwordReset as { unwrap(): unknown }).unwrap()).toBe(
        stored,
      );
      expect(em().removeAndFlush).toHaveBeenCalledWith(previous);
      expect(em().persistAndFlush.mock.invocationCallOrder[0]).toBeLessThan(
        em().removeAndFlush.mock.invocationCallOrder[0],
      );
    });

    it('does not wait for the email, and logs a failure to send it', async () => {
      users().findOne.mockResolvedValue({ email: 'someone@example.com' });
      send.mockRejectedValue(new Error('smtp down'));
      const logged = jest
        .spyOn(Logger.prototype, 'error')
        .mockImplementation(() => undefined);

      await expect(
        service.sendPasswordResetEmail('someone@example.com'),
      ).resolves.toBeUndefined();
      await new Promise((resolve) => setImmediate(resolve));

      expect(logged).toHaveBeenCalled();
    });

    it('fails for every address when this instance cannot send email', async () => {
      configured.mockReturnValue(false);
      await expect(
        service.sendPasswordResetEmail('nobody@example.com'),
      ).rejects.toThrow();
      expect(users().findOne).not.toHaveBeenCalled();
    });
  });
});
