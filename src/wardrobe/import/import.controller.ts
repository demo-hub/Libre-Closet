import {
  Controller,
  ForbiddenException,
  Post,
  Query,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { ConditionalAuthGuard } from '../../auth/conditional-auth.guard';
import { Payload } from '../../auth/dto/payload.dto';
import { WardrobeShareService } from '../../wardrobe-share/wardrobe-share.service';
import { ImportService } from './import.service';

@UseGuards(ConditionalAuthGuard)
@Controller('wardrobe/import')
export class ImportController {
  constructor(
    private readonly importService: ImportService,
    private readonly shareService: WardrobeShareService,
  ) {}

  @Post()
  async create(
    @Req() req: FastifyRequest,
    @Res() reply: FastifyReply,
    @Query('ownerId') ownerId: string | undefined,
  ) {
    const userId: number | undefined = (req['user'] as Payload | undefined)
      ?.userId;
    const viewOwner =
      userId != null && ownerId ? parseInt(ownerId, 10) : undefined;
    if (userId != null && viewOwner != null && viewOwner !== userId) {
      const canManage = await this.shareService.canManage(userId, viewOwner);
      if (!canManage) throw new ForbiddenException();
    }

    const garment = await this.importService.createFromMultipart(
      req,
      viewOwner ?? userId,
    );

    const params = new URLSearchParams({ created: '1' });
    if (viewOwner) params.set('ownerId', String(viewOwner));
    return reply.redirect(`/wardrobe/${garment.id}?${params}`, 302);
  }
}
