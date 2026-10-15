import { Injectable } from '@nestjs/common';
import { FastifyRequest } from 'fastify';
import { FileUrlService } from '../file/file-url/file-url.service';
import { InjectRepository } from '@mikro-orm/nestjs';
import { File } from '../dal/entity/file.entity';
import { Garment } from '../dal/entity/garment.entity';
import { Outfit } from '../dal/entity/outfit.entity';
import { EntityRepository } from '@mikro-orm/core';
import { garmentsInSlotOrder } from '../wardrobe/outfit-order';

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

function shareUrl(req: FastifyRequest, shareableId: string, type: string) {
  return `${req.protocol}://${req.host}/share?shareableId=${shareableId}&type=${type}`;
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
  ) {}

  /** The shared item with its Open Graph values, or null when there is nothing to show. Never names the owner. */
  public async getShareableTagValues(
    shareableId: string | undefined,
    type: string | undefined,
    req: FastifyRequest,
  ): Promise<SharedItem | null> {
    if (typeof shareableId !== 'string' || !shareableId) return null;

    if (type === 'file') {
      const file = await this.fileRepository.findOne({ shareableId });
      if (!file) return null;
      return {
        ogUrl: shareUrl(req, shareableId, type),
        ...previewImage(
          this.fileUrlService.getWatermarkedFileUrl(shareableId, req),
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
        ogUrl: shareUrl(req, shareableId, type),
        ...previewImage(
          garment.photo?.shareableId
            ? this.fileUrlService.getWatermarkedFileUrl(
                garment.photo.shareableId,
                req,
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
        ogUrl: shareUrl(req, shareableId, type),
        ...previewImage(
          photo?.shareableId
            ? this.fileUrlService.getWatermarkedFileUrl(photo.shareableId, req)
            : undefined,
        ),
        outfit,
        garments,
      };
    }

    return null;
  }
}
