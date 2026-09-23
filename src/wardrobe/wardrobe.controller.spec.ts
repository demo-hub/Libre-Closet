import { ForbiddenException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import type { FastifyReply, FastifyRequest } from 'fastify';
import type { I18nContext } from 'nestjs-i18n';
import { SharePermission } from '../dal/entity/wardrobe-share.entity';
import { ConditionalAuthGuard } from '../auth/conditional-auth.guard';
import { WardrobeShareService } from '../wardrobe-share/wardrobe-share.service';
import { GarmentService } from './garment.service';
import { WardrobeController } from './wardrobe.controller';

describe('WardrobeController', () => {
  let controller: WardrobeController;
  let garmentService: {
    archive: jest.Mock;
    create: jest.Mock;
    findAll: jest.Mock;
    findAvailableFilters: jest.Mock;
    resolveCategoryLabel: jest.Mock;
  };
  let shareService: {
    canManage: jest.Mock;
    canView: jest.Mock;
    getInboundShares: jest.Mock;
    getSharePermission: jest.Mock;
  };
  let reply: { header: jest.Mock; send: jest.Mock; redirect: jest.Mock };

  const requestAs = (userId?: number) =>
    ({
      user: userId != null ? { userId } : undefined,
    }) as unknown as FastifyRequest;

  beforeEach(async () => {
    garmentService = {
      archive: jest.fn().mockResolvedValue(undefined),
      create: jest.fn().mockResolvedValue({ id: 7 }),
      findAll: jest.fn().mockResolvedValue([]),
      findAvailableFilters: jest
        .fn()
        .mockResolvedValue({ categories: [], sizes: [], brands: [] }),
      resolveCategoryLabel: jest.fn((value: string) => `label:${value}`),
    };
    shareService = {
      canManage: jest.fn().mockResolvedValue(true),
      canView: jest.fn().mockResolvedValue(true),
      getInboundShares: jest.fn().mockResolvedValue([]),
      getSharePermission: jest.fn().mockResolvedValue(SharePermission.VIEW),
    };
    reply = {
      header: jest.fn(),
      send: jest.fn(),
      redirect: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [WardrobeController],
      providers: [
        { provide: GarmentService, useValue: garmentService },
        { provide: WardrobeShareService, useValue: shareService },
      ],
    })
      // Nest instantiates the controller's guard when compiling; the chain
      // itself is not exercised by direct method calls.
      .overrideGuard(ConditionalAuthGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get(WardrobeController);
  });

  // ownerId names a shared wardrobe, which only exists for a signed-in user.
  describe('ownerId with nobody signed in', () => {
    it('is ignored when archiving rather than raising a spurious 403', async () => {
      await controller.archive(
        1,
        requestAs(undefined),
        reply as unknown as FastifyReply,
        '9',
      );

      expect(garmentService.archive).toHaveBeenCalledWith(1, undefined);
      expect(reply.header).toHaveBeenCalledWith('HX-Redirect', '/wardrobe');
    });

    it('does not make a new garment land in a registered wardrobe', async () => {
      await controller.create(
        { category: 'tops' },
        requestAs(undefined),
        reply as unknown as FastifyReply,
        '9',
      );

      expect(garmentService.create).toHaveBeenCalledWith(
        expect.objectContaining({ category: 'tops' }),
        undefined,
      );
    });
  });

  describe('ownerId with a signed-in user', () => {
    it('still refuses to archive in a wardrobe owned by someone else', async () => {
      await expect(
        controller.archive(
          1,
          requestAs(5),
          reply as unknown as FastifyReply,
          '9',
        ),
      ).rejects.toBeInstanceOf(ForbiddenException);

      expect(garmentService.archive).not.toHaveBeenCalled();
    });

    it('creates into a wardrobe the user manages', async () => {
      await controller.create(
        { category: 'tops' },
        requestAs(5),
        reply as unknown as FastifyReply,
        '9',
      );

      expect(shareService.canManage).toHaveBeenCalledWith(5, 9);
      expect(garmentService.create).toHaveBeenCalledWith(
        expect.objectContaining({ category: 'tops' }),
        9,
      );
    });
  });

  describe('index', () => {
    const i18n = { t: (key: string) => key } as unknown as I18nContext;
    const index = (query: object, userId?: number, ownerId?: string) =>
      controller.index(requestAs(userId), query, ownerId, i18n);

    it('labels every card with its translated or custom category', async () => {
      garmentService.findAll.mockResolvedValue([
        { id: 1, category: 'tops' },
        { id: 2, category: 'Knitwear' },
      ]);

      const view = await index({});

      expect(view.categoryLabels).toEqual({
        tops: 'label:tops',
        Knitwear: 'label:Knitwear',
      });
    });

    it('turns each filter into a pill that names its facet', async () => {
      const view = await index({ category: 'tops', color: 'red' });

      expect(view.activeFilters.map((p) => [p.facet, p.value])).toEqual([
        ['lang.CATEGORY', 'label:tops'],
        ['lang.COLOR', 'red'],
      ]);
    });

    it('ignores a repeated parameter everywhere, not only in the pills', async () => {
      garmentService.findAll.mockResolvedValue([{ id: 1, category: 'tops' }]);

      const view = await index({ category: ['tops', 'bags'] });

      expect(garmentService.findAll).toHaveBeenCalledWith(
        undefined,
        expect.objectContaining({ category: undefined }),
        undefined,
      );
      expect(view.search.category).toBeUndefined();
      expect(view.activeFilters).toEqual([]);
      expect(view.emptyWardrobe).toBe(false);
      expect(garmentService.resolveCategoryLabel).not.toHaveBeenCalledWith(
        ['tops', 'bags'],
        i18n,
      );
    });

    it('tells an empty wardrobe from an empty search', async () => {
      expect((await index({})).emptyWardrobe).toBe(true);
      expect((await index({ archived: 'true' })).emptyWardrobe).toBe(true);
      expect((await index({ color: 'red' })).emptyWardrobe).toBe(false);
    });

    it('adds a garment to the shared wardrobe the user manages', async () => {
      shareService.getSharePermission.mockResolvedValue(SharePermission.MANAGE);

      const view = await index({ color: 'red' }, 5, '9');

      expect(view.newGarmentHref).toBe('/wardrobe/new?ownerId=9');
      expect(view.activeFilters[0].href).toBe('/wardrobe?ownerId=9');
    });

    it('offers no new garment in a wardrobe the user can only view', async () => {
      const view = await index({}, 5, '9');

      expect(view.canEdit).toBe(false);
      expect(view.newGarmentHref).toBeNull();
    });
  });
});
