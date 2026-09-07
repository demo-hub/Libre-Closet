import { ForbiddenException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { ConditionalAuthGuard } from '../auth/conditional-auth.guard';
import { WardrobeShareService } from '../wardrobe-share/wardrobe-share.service';
import { GarmentService } from './garment.service';
import { WardrobeController } from './wardrobe.controller';

describe('WardrobeController', () => {
  let controller: WardrobeController;
  let garmentService: { archive: jest.Mock; create: jest.Mock };
  let shareService: { canManage: jest.Mock };
  let reply: { header: jest.Mock; send: jest.Mock; redirect: jest.Mock };

  const requestAs = (userId?: number) =>
    ({
      user: userId != null ? { userId } : undefined,
    }) as unknown as FastifyRequest;

  beforeEach(async () => {
    garmentService = {
      archive: jest.fn().mockResolvedValue(undefined),
      create: jest.fn().mockResolvedValue({ id: 7 }),
    };
    shareService = { canManage: jest.fn().mockResolvedValue(true) };
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
});
