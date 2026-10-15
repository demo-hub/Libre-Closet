import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { FastifyRequest } from 'fastify';
import { FileUrlService } from '../file/file-url/file-url.service';
import { InjectRepository } from '@mikro-orm/nestjs';
import { File } from '../dal/entity/file.entity';
import { Garment } from '../dal/entity/garment.entity';
import { Outfit } from '../dal/entity/outfit.entity';
import { EntityRepository } from '@mikro-orm/core';
import { garmentsInSlotOrder } from '../wardrobe/outfit-order';
import { publicBaseUrl } from '../public-url';

export interface SharedItem {
  ogUrl: string;
  ogImage?: string;
  ogImageWidth?: undefined;
  ogImageHeight?: undefined;
  file?: File;
  garment?: Garment;
  outfit?: Outfit;
  garments?: Garment[];
}

/** A watermarked photo's size varies, so its dimensions are left unset; with no photo the default image stays. */
function previewImage(url: string | undefined) {
  return url
    ? { ogImage: url, ogImageWidth: undefined, ogImageHeight: undefined }
    : {};
}

@Injectable()
export class OpenGraphService {
  constructor(
    private readonly fileUrlService: FileUrlService,
    @InjectRepository(File)
    private readonly fileRepository: EntityRepository<File>,
    @InjectRepository(Garment)
    private readonly garmentRepository: EntityRepository<Garment>,
    @InjectRepository(Outfit)
    private readonly outfitRepository: EntityRepository<Outfit>,
    private readonly configService: ConfigService,
  ) {}

  /** The shared item with its Open Graph values, or null when there is nothing to show. Never names the owner. */
  public async getShareableTagValues(
    shareableId: string | undefined,
    type: string | undefined,
    req: FastifyRequest,
  ): Promise<SharedItem | null> {
    if (typeof shareableId !== 'string' || !shareableId) return null;
    // Where every other link to this instance points, preview images included.
    const base = publicBaseUrl(this.configService.get<string>('SITE_URL'), req);
    const ogUrl = `${base}/share?shareableId=${shareableId}&type=${type}`;

    if (type === 'file') {
      const file = await this.fileRepository.findOne({ shareableId });
      if (!file) return null;
      return {
        ogUrl,
        ...previewImage(
          this.fileUrlService.getWatermarkedFileUrl(shareableId, base),
        ),
        file,
      };
    }

    if (type === 'garment') {
      const garment = await this.garmentRepository.findOne(
        { shareableId },
        { populate: ['photo'] },
      );
      if (!garment) return null;
      return {
        ogUrl,
        ...previewImage(
          garment.photo?.shareableId
            ? this.fileUrlService.getWatermarkedFileUrl(
                garment.photo.shareableId,
                base,
              )
            : undefined,
        ),
        garment,
      };
    }

    if (type === 'outfit') {
      const outfit = await this.outfitRepository.findOne(
        { shareableId },
        { populate: ['garments', 'garments.photo'] },
      );
      if (!outfit) return null;
      const garments = garmentsInSlotOrder(outfit);
      const photo = garments.find((g) => g.photo?.shareableId)?.photo;
      return {
        ogUrl,
        ...previewImage(
          photo?.shareableId
            ? this.fileUrlService.getWatermarkedFileUrl(photo.shareableId, base)
            : undefined,
        ),
        outfit,
        garments,
      };
    }

    return null;
  }
}
