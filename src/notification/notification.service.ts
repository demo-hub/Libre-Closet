import { InjectRepository } from '@mikro-orm/nestjs';
import { EntityManager, EntityRepository } from '@mikro-orm/core';
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import webpush from 'web-push';
import { UserDevice } from '../dal/entity/userDevice.entity';
import { PushNotificationDto } from './dto/pushNotification.dto';
import { buildPushPayload } from './push-payload';
import { vapidSubject } from './vapid-subject';

@Injectable()
export class NotificationService {
  private logger = new Logger(NotificationService.name);

  constructor(
    private configService: ConfigService,
    @InjectRepository(UserDevice)
    private userDeviceRepository: EntityRepository<UserDevice>,
    private readonly em: EntityManager,
  ) {
    webpush.setVapidDetails(
      vapidSubject({
        SITE_URL: this.configService.get<string>('SITE_URL'),
        OPERATOR_CONTACT: this.configService.get<string>('OPERATOR_CONTACT'),
        SOURCE_URL: this.configService.get<string>('SOURCE_URL'),
      }),
      this.configService.get<string>('PUBLIC_VAPID_KEY') || '',
      this.configService.get<string>('PRIVATE_VAPID_KEY') || '',
    );
  }

  /**
   * Stores this browser's subscription for the user. An endpoint belongs to
   * one browser, so one already stored, for another account that signed in
   * here or with older keys, moves to this user.
   */
  public async addUserWebPushNotificationSubscription(
    userId: number,
    subscription: webpush.PushSubscription,
    userAgent: string,
  ): Promise<void> {
    const device = await this.userDeviceRepository.findOne({
      pushEndpoint: subscription.endpoint,
    });
    if (device) {
      this.em.assign(device, {
        user: userId,
        webPushSubscription: subscription,
        userAgent,
      });
    } else {
      this.em.persist(
        this.userDeviceRepository.create({
          user: userId,
          pushEndpoint: subscription.endpoint,
          webPushSubscription: subscription,
          userAgent,
        }),
      );
    }
    await this.em.flush();
  }

  public async hasUserWebPushSubscription(
    userId: number,
    endpoint: string,
  ): Promise<boolean> {
    const count = await this.userDeviceRepository.count({
      pushEndpoint: endpoint,
      user: userId,
    });
    return count > 0;
  }

  /** Forgets this browser's subscription, if it is the user's. */
  public async removeUserWebPushNotificationSubscription(
    userId: number,
    endpoint: string,
  ): Promise<void> {
    const device = await this.userDeviceRepository.findOne({
      pushEndpoint: endpoint,
      user: userId,
    });
    if (device) await this.em.removeAndFlush(device);
  }

  /**
   * Sends to each of the user's browsers and waits for every answer. A push
   * service answers 404 or 410 for a subscription that has ended, which is
   * then forgotten.
   */
  async sendWebPushNotification(
    notification: PushNotificationDto,
    userId: number,
  ) {
    const devices = await this.userDeviceRepository.find({ user: userId });
    const payload = JSON.stringify(buildPushPayload(notification));
    await Promise.all(
      devices.map(async (device) => {
        if (!device.webPushSubscription) return;
        try {
          await webpush.sendNotification(device.webPushSubscription, payload);
          this.logger.debug('Push notification sent.');
        } catch (error) {
          const status = (error as { statusCode?: number }).statusCode;
          if (status === 404 || status === 410) {
            this.em.remove(device);
          } else {
            this.logger.warn(error);
          }
        }
      }),
    );
    await this.em.flush();
  }
}
