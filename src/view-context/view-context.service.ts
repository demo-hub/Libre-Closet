import { EntityRepository } from '@mikro-orm/core';
import { InjectRepository } from '@mikro-orm/nestjs';
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { FastifyRequest } from 'fastify';
import { I18nContext } from 'nestjs-i18n';
import { GarmentEnricher } from '../ai/garment-enricher';
import { Payload } from '../auth/dto/payload.dto';
import { User } from '../dal/entity/user.entity';
import { publicBaseUrl } from '../public-url';
import { sectionOf } from './section';

@Injectable()
export class ViewContextService {
  private logger = new Logger(ViewContextService.name);

  constructor(
    @InjectRepository(User)
    private readonly userRepository: EntityRepository<User>,
    private configService: ConfigService,
    private jwtService: JwtService,
    private readonly enricher: GarmentEnricher,
  ) {}

  /** The AI button's label, naming the host the photo would go to. */
  private aiSuggestWith(): string | undefined {
    if (!this.enricher.available) return undefined;
    return I18nContext.current()?.t('lang.AI_SUGGEST_WITH', {
      args: { host: this.enricher.host },
    });
  }

  async buildContext(req: FastifyRequest) {
    const locale = I18nContext.current()?.lang ?? 'en';
    const path = req.url.split('?')[0];
    const siteUrl = publicBaseUrl(
      this.configService.get<string>('SITE_URL'),
      req,
    );
    const canonicalUrl = `${siteUrl}${path}`;
    const ogLocaleMap: Record<string, string> = {
      en: 'en_US',
      ru: 'ru_RU',
      es: 'es_ES',
      fr: 'fr_FR',
      it: 'it_IT',
      de: 'de_DE',
    };

    const appName = this.configService.get<string>('APP_NAME');
    const appDescription =
      I18nContext.current()?.t('lang.APP_DESCRIPTION') ??
      'Self-hosted wardrobe organiser. Catalogue clothes with photos, build outfits and install it as a progressive web app. Free and open source, with no subscription and no ads.';
    const ogImage = `${siteUrl}/assets/og-image.png`;

    const context: Record<string, any> = {
      appName,
      siteUrl,
      section: sectionOf(req.url),
      authEnabled: this.configService.get<boolean>('AUTH_ENABLED'),
      signupsDisabled: this.configService.get<boolean>('DISABLE_REGISTRATION'),
      pwaEnabled: this.configService.get<boolean>('PWA_ENABLED'),
      importUrlEnabled: this.configService.get<boolean>('IMPORT_URL_ENABLED'),
      // The provider's own answer, not AI_PROVIDER: a provider that is named
      // but unusable (no key, no model, an unparseable base URL) makes the
      // route 404, and a button in front of a 404 does nothing at all.
      aiEnabled: this.enricher.available,
      aiSuggestWith: this.aiSuggestWith(),
      locale,
      canonicalUrl,
      ogUrl: canonicalUrl,
      ogLocale: ogLocaleMap[locale] ?? 'en_US',
      ogTitle: appName,
      ogDescription: appDescription,
      ogImage,
      ogImageWidth: 1200,
      ogImageHeight: 630,
      sourceUrl: this.configService.get<string>('SOURCE_URL'),
      imageName: this.configService.get<string>('IMAGE_NAME'),
      operatorName: this.configService.get<string>('OPERATOR_NAME', ''),
      operatorContact: this.configService.get<string>('OPERATOR_CONTACT', ''),
    };

    const token = (req.cookies as Record<string, string>)?.['access_token'];
    if (token) {
      context.user = await this.signedInUser(token);
    }

    return context;
  }

  /**
   * Checks the password fingerprint as the auth guards do: a signature alone
   * would let a token naming any user id show that user's address.
   */
  private async signedInUser(token: string): Promise<User | undefined> {
    try {
      const payload: Payload = await this.jwtService.verifyAsync(token, {
        secret: this.configService.get<string>('ACCESS_TOKEN_SECRET'),
      });
      const user = await this.userRepository.findOne({ id: payload.userId });
      if (user && user.password.slice(-8) === payload.pwf) return user;
    } catch {
      this.logger.debug('User payload not available');
    }
    return undefined;
  }
}
