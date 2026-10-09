import {
  Controller,
  Get,
  NotFoundException,
  Query,
  Render,
  Req,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { FastifyRequest } from 'fastify';
import { I18n, I18nContext } from 'nestjs-i18n';
import { resolveCategoryLabel } from '../wardrobe/category-label';
import { OpenGraphService } from './open-graph.service';

@Controller('share')
export class OpenGraphController {
  constructor(
    private readonly openGraphService: OpenGraphService,
    private readonly configService: ConfigService,
  ) {}

  @Get()
  @Render('share')
  async share(
    @Query('shareableId') shareableId: string,
    @Query('type') type: string,
    @Req() req: FastifyRequest,
    @I18n() i18n: I18nContext,
  ) {
    const item = await this.openGraphService.getShareableTagValues(
      shareableId,
      type,
      req,
    );
    if (!item) throw new NotFoundException();

    const sharedFrom = i18n.t('lang.SHARED_FROM', {
      args: { appName: this.configService.get<string>('APP_NAME') },
    });
    const categoryLabel =
      item.garment && resolveCategoryLabel(item.garment.category, i18n);
    let pageTitle = item.file?.fileName;
    if (item.garment) pageTitle = item.garment.name || categoryLabel;
    if (item.outfit) {
      pageTitle = item.outfit.name || i18n.t('lang.UNTITLED_OUTFIT');
    }

    return {
      ...item,
      garments: item.garments?.map((garment) => ({
        photo: garment.photo,
        label: garment.name || resolveCategoryLabel(garment.category, i18n),
      })),
      categoryLabel,
      sharedFrom,
      pageTitle,
      ogTitle: pageTitle,
      ogDescription: sharedFrom,
      canonicalUrl: item.ogUrl,
    };
  }
}
