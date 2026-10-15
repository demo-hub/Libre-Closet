import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { I18n, I18nContext } from 'nestjs-i18n';
import { AuthGuard } from '../auth/auth.guard';
import { Payload } from '../auth/dto/payload.dto';
import { User } from '../auth/user.decorator';
import { NotificationService } from './notification.service';
import { PushNotificationDto } from './dto/pushNotification.dto';
import { pushSubscriptionFrom } from './push-subscription';

@Controller('notification')
export class NotificationController {
  constructor(
    private notificationService: NotificationService,
    private configService: ConfigService,
  ) {}

  @Get('vapid-public-key')
  getVapidPublicKey() {
    return this.configService.getOrThrow<string>('PUBLIC_VAPID_KEY');
  }

  @UseGuards(AuthGuard)
  @Post('subscribe')
  async postSubscribe(
    @Headers('user-agent') userAgent: string,
    @User() payload: Payload,
    @Body() body: unknown,
  ) {
    const subscription = pushSubscriptionFrom(body);
    if (!subscription) throw new BadRequestException();
    await this.notificationService.addUserWebPushNotificationSubscription(
      Number(payload.userId),
      subscription,
      String(userAgent ?? '').slice(0, 512),
    );
  }

  /** Whether this browser's subscription is the signed-in user's: after a sign-out without JavaScript it is still the last account's. */
  @UseGuards(AuthGuard)
  @Post('subscribed')
  @HttpCode(200)
  async postSubscribed(
    @User() payload: Payload,
    @Body() body: { endpoint?: unknown },
  ) {
    if (typeof body?.endpoint !== 'string') throw new BadRequestException();
    return {
      subscribed: await this.notificationService.hasUserWebPushSubscription(
        Number(payload.userId),
        body.endpoint,
      ),
    };
  }

  /** Sign-out calls this before the session ends, so the browser stops receiving this user's notifications. */
  @UseGuards(AuthGuard)
  @Post('unsubscribe')
  @HttpCode(204)
  async postUnsubscribe(
    @User() payload: Payload,
    @Body() body: { endpoint?: unknown },
  ) {
    if (typeof body?.endpoint !== 'string') throw new BadRequestException();
    await this.notificationService.removeUserWebPushNotificationSubscription(
      Number(payload.userId),
      body.endpoint,
    );
  }

  @UseGuards(AuthGuard)
  @Post('test')
  async postTest(@User() payload: Payload, @I18n() i18n: I18nContext) {
    const notification: PushNotificationDto = {
      title: this.configService.getOrThrow<string>('APP_NAME'),
      body: i18n.t('lang.TEST_WEB_PUSH'),
      url: '/chat',
    };
    await this.notificationService.sendWebPushNotification(
      notification,
      Number(payload.userId),
    );
  }
}
