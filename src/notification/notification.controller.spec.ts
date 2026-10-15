import { EntityManager } from '@mikro-orm/core';
import { getRepositoryToken } from '@mikro-orm/nestjs';
import { BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { Test, TestingModule } from '@nestjs/testing';
import { User } from '../dal/entity/user.entity';
import { UserDevice } from '../dal/entity/userDevice.entity';
import { NotificationController } from './notification.controller';
import { NotificationService } from './notification.service';
import { AuthService } from '../auth/auth.service';

describe('NotificationController', () => {
  let controller: NotificationController;
  let service: NotificationService;

  const DUMMY_VAPID_KEYS = {
    publicKey:
      'BEl62iUYgUivxIkv69yViEuiBIa-Ib9-SkvMeAtA3LFgDzkrxZJjSgSnfckjBJuBkr3qBUYIHBQFLXYp5Nksh8U',
    privateKey: 'UUxI4O8-FbRouAevSmBQ6o18hgE4nSG3qwvJTfKc-ls',
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [NotificationController],
      providers: [
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn((key: string) => {
              switch (key) {
                case 'SITE_URL':
                  return 'https://mysite.com';
                case 'PUBLIC_VAPID_KEY':
                  return DUMMY_VAPID_KEYS.publicKey;
                case 'PRIVATE_VAPID_KEY':
                  return DUMMY_VAPID_KEYS.privateKey;
                default:
                  return '';
              }
            }),
          },
        },
        JwtService,
        {
          provide: AuthService,
          useValue: { verifyPwf: jest.fn() },
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
          provide: getRepositoryToken(UserDevice),
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
            // you can mock other functions inside
            // the entity manager object, my case only needed query method
          },
        },
        NotificationService,
      ],
    }).compile();

    controller = module.get<NotificationController>(NotificationController);
    service = module.get(NotificationService);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  it('refuses a subscription the server should not post to', async () => {
    await expect(
      controller.postSubscribe(
        'Firefox',
        { userId: 1 },
        {
          endpoint: 'https://127.0.0.1/1',
          keys: {
            p256dh: 'p256dh-key-value-1234',
            auth: 'auth-key-value-1234',
          },
        },
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('forgets a browser by its endpoint, for the signed-in user only', async () => {
    const remove = jest
      .spyOn(service, 'removeUserWebPushNotificationSubscription')
      .mockResolvedValue();

    await controller.postUnsubscribe(
      { userId: 1 },
      {
        endpoint: 'https://push.example/1',
      },
    );
    await expect(
      controller.postUnsubscribe({ userId: 1 }, {}),
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(remove).toHaveBeenCalledTimes(1);
    expect(remove).toHaveBeenCalledWith(1, 'https://push.example/1');
  });

  it('says whether this browser is subscribed for the signed-in user', async () => {
    const has = jest
      .spyOn(service, 'hasUserWebPushSubscription')
      .mockResolvedValue(true);

    await expect(
      controller.postSubscribed(
        { userId: 1 },
        { endpoint: 'https://push.example/1' },
      ),
    ).resolves.toEqual({ subscribed: true });
    await expect(
      controller.postSubscribed({ userId: 1 }, {}),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(has).toHaveBeenCalledWith(1, 'https://push.example/1');
  });
});
