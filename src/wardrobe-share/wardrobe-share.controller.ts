import {
  BadRequestException,
  Body,
  Controller,
  ForbiddenException,
  Get,
  Logger,
  NotFoundException,
  Param,
  ParseIntPipe,
  Post,
  Query,
  Render,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import { I18n, I18nContext } from 'nestjs-i18n';
import { AuthGuard } from '../auth/auth.guard';
import { ConditionalAuthGuard } from '../auth/conditional-auth.guard';
import { Payload } from '../auth/dto/payload.dto';
import { User } from '../auth/user.decorator';
import { OWN_INVITE, WardrobeShareService } from './wardrobe-share.service';
import { SharePermission } from '../dal/entity/wardrobe-share.entity';
import type { FastifyReply, FastifyRequest } from 'fastify';

/** What ?error= may name: a link can put no other text on the page. */
const INVITE_ERRORS = new Map([
  ['not-found', 'lang.INVITE_NOT_FOUND'],
  ['own-invite', 'lang.INVITE_OWN'],
]);

@UseGuards(ConditionalAuthGuard)
@Controller('wardrobe-share')
export class WardrobeShareController {
  private readonly logger = new Logger(WardrobeShareController.name);

  constructor(private readonly shareService: WardrobeShareService) {}

  private async managePage(
    payload: Payload,
    req: FastifyRequest,
    i18n: I18nContext,
  ) {
    const [outbound, inbound, pending] = await Promise.all([
      this.shareService.getOutboundShares(payload.userId),
      this.shareService.getInboundShares(payload.userId),
      this.shareService.getPendingShares(payload.userId),
    ]);

    const mapShare = (s: any) => ({
      id: s.id,
      grantor: s.grantor?.unwrap?.() ?? s.grantor,
      grantee: s.grantee?.unwrap?.() ?? s.grantee,
      permission: s.permission,
      inviteToken: s.inviteToken,
      acceptedAt: s.acceptedAt,
    });

    return {
      outbound: outbound.map(mapShare),
      inbound: inbound.map(mapShare),
      pending: pending.map(mapShare),
      baseUrl: `${req.protocol}://${req.headers.host}`,
      pageTitle: i18n.t('lang.WARDROBE_SHARING'),
    };
  }

  @UseGuards(AuthGuard)
  @Get('manage')
  @Render('wardrobe-share/manage')
  async manage(
    @User() payload: Payload,
    @Req() req: FastifyRequest,
    @Query('error') error: string | undefined,
    @I18n() i18n: I18nContext,
  ) {
    const key =
      typeof error === 'string' ? INVITE_ERRORS.get(error) : undefined;
    return {
      ...(await this.managePage(payload, req, i18n)),
      error: key ? i18n.t(key) : null,
    };
  }

  @UseGuards(AuthGuard)
  @Post('create-invite-link')
  async createInviteLink(
    @User() payload: Payload,
    @Body() body: { permission?: string } | undefined,
    @Req() req: FastifyRequest,
    @Res() reply: FastifyReply,
    @I18n() i18n: I18nContext,
  ) {
    const permission =
      body?.permission === SharePermission.MANAGE
        ? SharePermission.MANAGE
        : SharePermission.VIEW;
    const share = await this.shareService.createInviteLink(
      payload.userId,
      permission,
    );

    if (!req.headers['hx-request']) {
      return reply.redirect('/wardrobe-share/manage', 302);
    }
    const page = await this.managePage(payload, req, i18n);
    return reply.view('wardrobe-share/manage', {
      layout: 'layout',
      ...page,
      permission,
      inviteUrl: `${page.baseUrl}/wardrobe-share/invite/${share.inviteToken}`,
    });
  }

  @UseGuards(AuthGuard)
  @Post(':id/remove')
  async removeShare(
    @User() payload: Payload,
    @Param('id', ParseIntPipe) shareId: number,
    @Res() reply: FastifyReply,
  ) {
    await this.shareService.removeShare(shareId, payload.userId);
    return reply.redirect('/wardrobe-share/manage', 302);
  }

  @UseGuards(ConditionalAuthGuard)
  @Get('invite/:token')
  @Render('wardrobe-share/invite')
  async viewInvite(
    @Param('token') token: string,
    @User() payload: Payload | undefined,
    @I18n() i18n: I18nContext,
  ) {
    const pageTitle = i18n.t('lang.WARDROBE_INVITE');
    const share = await this.shareService.findInviteByToken(token);
    if (!share) {
      return {
        pageTitle,
        error: true,
        message: i18n.t('lang.INVITE_NOT_FOUND'),
      };
    }

    return {
      pageTitle,
      share,
      grantorName:
        share.grantor.unwrap().firstName ||
        share.grantor.unwrap().email ||
        i18n.t('lang.INVITE_FROM_SOMEONE'),
      token,
      isLoggedIn: !!payload,
    };
  }

  @UseGuards(AuthGuard)
  @Post('invite/:token/accept')
  async acceptInvite(
    @User() payload: Payload,
    @Param('token') token: string,
    @Res() reply: FastifyReply,
  ) {
    try {
      await this.shareService.acceptInvite(token, payload.userId);
    } catch (e) {
      if (e instanceof ForbiddenException && e.message === OWN_INVITE) {
        return reply.redirect('/wardrobe-share/manage?error=own-invite', 302);
      }
      if (e instanceof NotFoundException || e instanceof ForbiddenException) {
        return reply.redirect('/wardrobe-share/manage?error=not-found', 302);
      }
      // A BadRequest here means they already have this wardrobe.
      if (!(e instanceof BadRequestException)) this.logger.warn(e);
    }
    return reply.redirect('/wardrobe-share/manage', 302);
  }

  @UseGuards(AuthGuard)
  @Post('invite/:token/decline')
  async declineInvite(
    @User() payload: Payload,
    @Param('token') token: string,
    @Res() reply: FastifyReply,
  ) {
    try {
      await this.shareService.declineInvite(token, payload.userId);
    } catch (e) {
      this.logger.warn(e);
    }
    return reply.redirect('/wardrobe-share/manage', 302);
  }
}
