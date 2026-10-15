import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { Test, TestingModule } from '@nestjs/testing';
import type { FastifyReply, FastifyRequest } from 'fastify';
import type { I18nContext } from 'nestjs-i18n';
import { AuthService } from '../auth/auth.service';
import { SharePermission } from '../dal/entity/wardrobe-share.entity';
import { WardrobeShareController } from './wardrobe-share.controller';
import { OWN_INVITE, WardrobeShareService } from './wardrobe-share.service';

describe('WardrobeShareController', () => {
  let controller: WardrobeShareController;
  let shares: Record<
    | 'getOutboundShares'
    | 'getInboundShares'
    | 'getPendingShares'
    | 'createInviteLink'
    | 'findInviteByToken'
    | 'acceptInvite',
    jest.Mock
  >;
  let reply: { redirect: jest.Mock; view: jest.Mock };
  const i18n = { t: (key: string) => key } as unknown as I18nContext;
  const payload = { userId: 1 };
  const req = (htmx = false) =>
    ({
      protocol: 'https',
      headers: {
        host: 'closet.example',
        ...(htmx && { 'hx-request': 'true' }),
      },
    }) as unknown as FastifyRequest;
  const asReply = () => reply as unknown as FastifyReply;

  beforeEach(async () => {
    shares = {
      getOutboundShares: jest.fn().mockResolvedValue([]),
      getInboundShares: jest.fn().mockResolvedValue([]),
      getPendingShares: jest.fn().mockResolvedValue([]),
      createInviteLink: jest.fn().mockResolvedValue({ inviteToken: 'tok' }),
      findInviteByToken: jest.fn(),
      acceptInvite: jest.fn(),
    };
    reply = { redirect: jest.fn(), view: jest.fn() };
    const module: TestingModule = await Test.createTestingModule({
      controllers: [WardrobeShareController],
      providers: [
        { provide: WardrobeShareService, useValue: shares },
        JwtService,
        ConfigService,
        { provide: AuthService, useValue: { verifyPwf: jest.fn() } },
      ],
    }).compile();

    controller = module.get(WardrobeShareController);
  });

  describe('the invite page', () => {
    it('says an unknown invite was not found, in the reader’s language', async () => {
      shares.findInviteByToken.mockResolvedValue(null);

      await expect(
        controller.viewInvite('nope', undefined, i18n),
      ).resolves.toEqual({
        pageTitle: 'lang.WARDROBE_INVITE',
        error: true,
        message: 'lang.INVITE_NOT_FOUND',
      });
    });

    it('names the person inviting, or someone when it cannot', async () => {
      const invite = (grantor: object) => ({
        grantor: { unwrap: () => grantor },
      });
      shares.findInviteByToken.mockResolvedValueOnce(
        invite({ email: 'olivia@example.com' }),
      );
      shares.findInviteByToken.mockResolvedValueOnce(invite({}));

      const named = await controller.viewInvite('t', undefined, i18n);
      const unnamed = await controller.viewInvite('t', undefined, i18n);

      expect(named).toMatchObject({
        grantorName: 'olivia@example.com',
        pageTitle: 'lang.WARDROBE_INVITE',
      });
      expect(unnamed).toMatchObject({
        grantorName: 'lang.INVITE_FROM_SOMEONE',
      });
    });
  });

  describe('the sharing page', () => {
    it.each([
      ['own-invite', 'lang.INVITE_OWN'],
      ['not-found', 'lang.INVITE_NOT_FOUND'],
      ['Your session expired. Sign in at evil.example', null],
      ['constructor', null],
      [undefined, null],
    ])('shows ?error=%s as %s', async (error, shown) => {
      const page = await controller.manage(payload, req(), error, i18n);

      expect(page.error).toBe(shown);
      expect(page.pageTitle).toBe('lang.WARDROBE_SHARING');
    });
  });

  describe('accepting an invite', () => {
    it.each([
      [new ForbiddenException(OWN_INVITE), '?error=own-invite'],
      [new NotFoundException(), '?error=not-found'],
      [new ForbiddenException('Sent to someone else.'), '?error=not-found'],
      [new BadRequestException('Already shared.'), ''],
    ])('names a refusal by code: %s', async (refusal, query) => {
      shares.acceptInvite.mockRejectedValue(refusal);

      await controller.acceptInvite(payload, 't', asReply());

      expect(reply.redirect).toHaveBeenCalledWith(
        `/wardrobe-share/manage${query}`,
        302,
      );
    });
  });

  describe('creating an invite link', () => {
    it('answers htmx with the whole page, the new link in it', async () => {
      await controller.createInviteLink(
        payload,
        { permission: 'MANAGE' },
        req(true),
        asReply(),
        i18n,
      );

      expect(shares.createInviteLink).toHaveBeenCalledWith(
        1,
        SharePermission.MANAGE,
      );
      expect(reply.view).toHaveBeenCalledWith(
        'wardrobe-share/manage',
        expect.objectContaining({
          layout: 'layout',
          permission: 'MANAGE',
          inviteUrl: 'https://closet.example/wardrobe-share/invite/tok',
          pageTitle: 'lang.WARDROBE_SHARING',
        }),
      );
    });

    it('goes back to the page without JavaScript', async () => {
      await controller.createInviteLink(
        payload,
        { permission: 'VIEW' },
        req(),
        asReply(),
        i18n,
      );

      expect(reply.redirect).toHaveBeenCalledWith(
        '/wardrobe-share/manage',
        302,
      );
    });

    it.each(['manage', 'ADMIN', undefined])(
      'stores %s as view only',
      async (permission) => {
        await controller.createInviteLink(
          payload,
          { permission },
          req(),
          asReply(),
          i18n,
        );

        expect(shares.createInviteLink).toHaveBeenCalledWith(
          1,
          SharePermission.VIEW,
        );
      },
    );
  });
});
