import { EntityRepository } from '@mikro-orm/core';
import { InjectRepository } from '@mikro-orm/nestjs';
import {
  BadRequestException,
  Controller,
  Get,
  Header,
  Logger,
  NotFoundException,
  Param,
  Post,
  Render,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { I18n, I18nContext } from 'nestjs-i18n';
import { AuthGuard } from '../../auth/auth.guard';
import { Payload } from '../../auth/dto/payload.dto';
import { User } from '../../auth/user.decorator';
import { User as UserEntity } from '../../dal/entity/user.entity';
import { FileService } from '../file-service.abstract';
import { ConditionalAuthGuard } from '../../auth/conditional-auth.guard';
import { SkipThrottle } from '@nestjs/throttler';

@Controller('file')
export class FileController {
  private logger = new Logger(FileController.name);

  constructor(
    private readonly fileService: FileService,
    @InjectRepository(UserEntity)
    private readonly userRepository: EntityRepository<UserEntity>,
  ) {}

  @UseGuards(ConditionalAuthGuard)
  @Get('files')
  @Render('files')
  async getFiles(
    @User() payload: Payload | undefined,
    @I18n() i18n: I18nContext,
  ) {
    // Only AUTH_ENABLED=false arrives without a payload, and a file needs an owner.
    if (!payload) throw new NotFoundException();
    return this.filesPage(payload, i18n);
  }

  @UseGuards(AuthGuard)
  @Post('upload')
  @Render('files')
  async uploadFile(
    @User() payload: Payload,
    @Req() req: FastifyRequest,
    @I18n() i18n: I18nContext,
  ) {
    const data = await req.file();
    if (!data) throw new BadRequestException();
    await this.fileService.storeImageFromFileUpload(data, payload.userId);
    return this.filesPage(payload, i18n);
  }

  private async filesPage(payload: Payload, i18n: I18nContext) {
    const user = await this.userRepository.findOne(
      { id: payload.userId },
      { populate: ['fileUploads'] },
    );
    return {
      files: user?.fileUploads.getItems() ?? [],
      pageTitle: i18n.t('lang.FILES'),
    };
  }

  @SkipThrottle()
  @Get(':fileName')
  @Header('Cache-Control', 'public, max-age=31536000, immutable') // public for CDN, max-age= 1 year for immutable content
  async getFile(@Param('fileName') fileName: string) {
    return this.fileService.get(fileName);
  }

  @Get('watermark/:shareableId')
  @Header('Cache-Control', 'public, max-age=86400') // public for CDN, max-age= 24hrs in seconds
  @Header('content-type', 'image/jpeg')
  async watermark(@Param('shareableId') shareableId: string) {
    const fileStream = await this.fileService.getByShareableId(shareableId);
    return this.fileService.watermarkImage(fileStream);
  }

  @SkipThrottle()
  @Get('nobg/:fileName')
  @Header('content-type', 'image/webp')
  async nobg(@Param('fileName') fileName: string, @Res() reply: FastifyReply) {
    const stream = await this.fileService.getNobgVariant(fileName);
    if (!stream) {
      return reply
        .header('Cache-Control', 'no-store')
        .redirect(`/file/${fileName}`, 302);
    }
    reply.header('Cache-Control', 'no-store');
    // Log stream errors, but don't try to re-send if headers are already in flight
    stream.on('error', (err) => {
      this.logger.error(err);
      if (!reply.sent) {
        reply.code(500).send({ message: 'Internal server error' });
      }
    });
    return reply.send(stream);
  }
}
