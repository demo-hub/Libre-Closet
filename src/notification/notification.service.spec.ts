import { EntityManager } from '@mikro-orm/core';
import { getRepositoryToken } from '@mikro-orm/nestjs';
import { ConfigService } from '@nestjs/config';
import { Test, TestingModule } from '@nestjs/testing';
import { UserDevice } from '../dal/entity/userDevice.entity';
import webpush from 'web-push';
import { NotificationService } from './notification.service';

describe('NotificationService', () => {
  let service: NotificationService;
  let devices: {
    count: jest.Mock;
    findOne: jest.Mock;
    find: jest.Mock;
    create: jest.Mock;
  };
  let em: {
    assign: jest.Mock;
    persist: jest.Mock;
    remove: jest.Mock;
    flush: jest.Mock;
    removeAndFlush: jest.Mock;
  };

  const DUMMY_VAPID_KEYS = {
    publicKey:
      'BEl62iUYgUivxIkv69yViEuiBIa-Ib9-SkvMeAtA3LFgDzkrxZJjSgSnfckjBJuBkr3qBUYIHBQFLXYp5Nksh8U',
    privateKey: 'UUxI4O8-FbRouAevSmBQ6o18hgE4nSG3qwvJTfKc-ls',
  };
  const subscription = (endpoint = 'https://push.example/1') => ({
    endpoint,
    keys: { p256dh: 'p256dh-key-value-1234', auth: 'auth-key-value-1234' },
  });

  beforeEach(async () => {
    devices = {
      findOne: jest.fn().mockResolvedValue(null),
      find: jest.fn().mockResolvedValue([]),
      count: jest.fn().mockResolvedValue(0),
      create: jest.fn((data: object) => ({ ...data })),
    };
    em = {
      assign: jest.fn(),
      persist: jest.fn(),
      remove: jest.fn(),
      flush: jest.fn(),
      removeAndFlush: jest.fn(),
    };
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
        { provide: getRepositoryToken(UserDevice), useValue: devices },
        { provide: EntityManager, useValue: em },
      ],
    }).compile();

    service = module.get<NotificationService>(NotificationService);
  });

  afterEach(() => jest.restoreAllMocks());

  it.each([undefined, '', 'http://192.168.1.10:3000'])(
    'starts with SITE_URL %p, which web-push would refuse as a subject',
    (siteUrl) => {
      const config = {
        get: (key: string) =>
          ({
            SITE_URL: siteUrl,
            PUBLIC_VAPID_KEY: DUMMY_VAPID_KEYS.publicKey,
            PRIVATE_VAPID_KEY: DUMMY_VAPID_KEYS.privateKey,
          })[key],
      } as unknown as ConfigService;
      expect(
        () => new NotificationService(config, {} as never, {} as never),
      ).not.toThrow();
    },
  );

  describe('subscribing', () => {
    it('stores a new browser for the user', async () => {
      await service.addUserWebPushNotificationSubscription(
        1,
        subscription(),
        'Firefox',
      );

      expect(em.persist).toHaveBeenCalledWith({
        user: 1,
        pushEndpoint: 'https://push.example/1',
        webPushSubscription: subscription(),
        userAgent: 'Firefox',
      });
      expect(em.flush).toHaveBeenCalled();
    });

    it('moves a browser another account subscribed to this user, with its new keys', async () => {
      const device = {
        user: { id: 2 },
        pushEndpoint: 'https://push.example/1',
        webPushSubscription: { endpoint: 'https://push.example/1', keys: {} },
      };
      devices.findOne.mockResolvedValue(device);

      await service.addUserWebPushNotificationSubscription(
        1,
        subscription(),
        'Firefox',
      );

      expect(devices.findOne).toHaveBeenCalledWith({
        pushEndpoint: 'https://push.example/1',
      });
      expect(em.assign).toHaveBeenCalledWith(device, {
        user: 1,
        webPushSubscription: subscription(),
        userAgent: 'Firefox',
      });
      expect(em.persist).not.toHaveBeenCalled();
      expect(em.flush).toHaveBeenCalled();
    });
  });

  it('counts a browser as subscribed only for the account it is stored under', async () => {
    devices.count.mockResolvedValueOnce(1).mockResolvedValueOnce(0);

    await expect(
      service.hasUserWebPushSubscription(1, 'https://push.example/1'),
    ).resolves.toBe(true);
    await expect(
      service.hasUserWebPushSubscription(2, 'https://push.example/1'),
    ).resolves.toBe(false);
    expect(devices.count).toHaveBeenLastCalledWith({
      pushEndpoint: 'https://push.example/1',
      user: 2,
    });
  });

  describe('unsubscribing', () => {
    it('forgets the browser only when it is the user’s', async () => {
      const device = { pushEndpoint: 'https://push.example/1' };
      devices.findOne.mockResolvedValueOnce(device).mockResolvedValueOnce(null);

      await service.removeUserWebPushNotificationSubscription(
        1,
        'https://push.example/1',
      );
      await service.removeUserWebPushNotificationSubscription(
        1,
        'https://push.example/other',
      );

      expect(devices.findOne).toHaveBeenCalledWith({
        pushEndpoint: 'https://push.example/1',
        user: 1,
      });
      expect(em.removeAndFlush).toHaveBeenCalledTimes(1);
      expect(em.removeAndFlush).toHaveBeenCalledWith(device);
    });
  });

  describe('sending', () => {
    it('puts the body, icon, badge and click target where the service worker reads them', async () => {
      devices.find.mockResolvedValue([{ webPushSubscription: subscription() }]);
      const send = jest
        .spyOn(webpush, 'sendNotification')
        .mockResolvedValue({ statusCode: 201, body: '', headers: {} });

      await service.sendWebPushNotification(
        { title: 'Libre Closet', body: 'Hello', url: '/chat' },
        1,
      );

      expect(devices.find).toHaveBeenCalledWith({ user: 1 });
      expect(send).toHaveBeenCalledWith(subscription(), expect.any(String));
      expect(JSON.parse(send.mock.calls[0][1] as string)).toEqual({
        title: 'Libre Closet',
        options: {
          body: 'Hello',
          icon: '/assets/icons/icon-192.png',
          badge: '/assets/icons/badge-96.png',
          data: { url: '/chat' },
        },
      });
    });

    it('waits for every browser, and forgets one whose subscription has ended', async () => {
      const ended = {
        webPushSubscription: subscription('https://push.example/gone'),
      };
      const failing = {
        webPushSubscription: subscription('https://push.example/down'),
      };
      const fine = { webPushSubscription: subscription() };
      devices.find.mockResolvedValue([ended, failing, fine]);
      jest.spyOn(webpush, 'sendNotification').mockImplementation((sub) => {
        if (sub.endpoint.endsWith('/gone')) {
          return Promise.reject(
            Object.assign(new Error('Gone'), { statusCode: 410 }),
          );
        }
        if (sub.endpoint.endsWith('/down')) {
          return Promise.reject(
            Object.assign(new Error('Busy'), { statusCode: 503 }),
          );
        }
        return Promise.resolve({ statusCode: 201, body: '', headers: {} });
      });

      await service.sendWebPushNotification({ title: 'T', body: 'B' }, 1);

      expect(em.remove).toHaveBeenCalledTimes(1);
      expect(em.remove).toHaveBeenCalledWith(ended);
      expect(em.flush).toHaveBeenCalled();
    });
  });
});
