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
        ConfigService,
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
});
