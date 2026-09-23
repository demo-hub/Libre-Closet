import { EntityManager } from '@mikro-orm/core';
import { getRepositoryToken } from '@mikro-orm/nestjs';
import { ConfigService } from '@nestjs/config';
import { Test, TestingModule } from '@nestjs/testing';
import { User } from '../dal/entity/user.entity';
import { UserDevice } from '../dal/entity/userDevice.entity';
import webpush from 'web-push';
import { NotificationService } from './notification.service';

describe('NotificationService', () => {
  let service: NotificationService;
  let users: { findOneOrFail: jest.Mock };

  const DUMMY_VAPID_KEYS = {
    publicKey:
      'BEl62iUYgUivxIkv69yViEuiBIa-Ib9-SkvMeAtA3LFgDzkrxZJjSgSnfckjBJuBkr3qBUYIHBQFLXYp5Nksh8U',
    privateKey: 'UUxI4O8-FbRouAevSmBQ6o18hgE4nSG3qwvJTfKc-ls',
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
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
        NotificationService,
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
      ],
    }).compile();

    service = module.get<NotificationService>(NotificationService);
    users = module.get(getRepositoryToken(User));
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('puts the body, icon, badge and click target where the service worker reads them', async () => {
    const subscription = { endpoint: 'https://push.example/1', keys: {} };
    users.findOneOrFail.mockResolvedValue({
      userDevices: {
        loadItems: () =>
          Promise.resolve([{ webPushSubscription: subscription }]),
      },
    });
    const send = jest
      .spyOn(webpush, 'sendNotification')
      .mockResolvedValue({ statusCode: 201, body: '', headers: {} });

    await service.sendWebPushNotification(
      { title: 'Libre Closet', body: 'Hello', url: '/chat' },
      1,
    );

    expect(send).toHaveBeenCalledWith(subscription, expect.any(String));
    expect(JSON.parse(send.mock.calls[0][1])).toEqual({
      title: 'Libre Closet',
      options: {
        body: 'Hello',
        icon: '/assets/icons/icon-192.png',
        badge: '/assets/icons/badge-96.png',
        data: { url: '/chat' },
      },
    });
  });
});
