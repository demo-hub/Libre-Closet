import { ForbiddenException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { ConditionalAuthGuard } from '../../auth/conditional-auth.guard';
import { WardrobeShareService } from '../../wardrobe-share/wardrobe-share.service';
import { ImportController } from './import.controller';
import { ImportService } from './import.service';

describe('ImportController', () => {
  let controller: ImportController;
  let importService: { createFromMultipart: jest.Mock };
  let shareService: { canManage: jest.Mock };
  let reply: { redirect: jest.Mock };

  const requestAs = (userId?: number) =>
    ({
      user: userId != null ? { userId } : undefined,
    }) as unknown as FastifyRequest;

  beforeEach(async () => {
    importService = {
      createFromMultipart: jest.fn().mockResolvedValue({ id: 7 }),
    };
    shareService = { canManage: jest.fn().mockResolvedValue(true) };
    reply = { redirect: jest.fn() };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [ImportController],
      providers: [
        { provide: ImportService, useValue: importService },
        { provide: WardrobeShareService, useValue: shareService },
      ],
    })
      .overrideGuard(ConditionalAuthGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get(ImportController);
  });

  it('is guarded by ConditionalAuthGuard', () => {
    const guards: unknown[] =
      Reflect.getMetadata('__guards__', ImportController) ?? [];
    expect(guards).toContain(ConditionalAuthGuard);
  });

  it('creates for the signed-in user and redirects to the garment', async () => {
    await controller.create(
      requestAs(5),
      reply as unknown as FastifyReply,
      undefined,
    );

    expect(importService.createFromMultipart).toHaveBeenCalledWith(
      expect.anything(),
      5,
    );
    expect(reply.redirect).toHaveBeenCalledWith('/wardrobe/7?created=1', 302);
  });

  it('creates into a shared wardrobe with manage permission', async () => {
    await controller.create(
      requestAs(5),
      reply as unknown as FastifyReply,
      '9',
    );

    expect(shareService.canManage).toHaveBeenCalledWith(5, 9);
    expect(importService.createFromMultipart).toHaveBeenCalledWith(
      expect.anything(),
      9,
    );
    expect(reply.redirect).toHaveBeenCalledWith(
      '/wardrobe/7?created=1&ownerId=9',
      302,
    );
  });

  it('refuses a shared wardrobe without manage permission', async () => {
    shareService.canManage.mockResolvedValueOnce(false);

    await expect(
      controller.create(requestAs(5), reply as unknown as FastifyReply, '9'),
    ).rejects.toBeInstanceOf(ForbiddenException);

    expect(importService.createFromMultipart).not.toHaveBeenCalled();
  });

  it('ignores ownerId when nobody is signed in', async () => {
    await controller.create(
      requestAs(undefined),
      reply as unknown as FastifyReply,
      '9',
    );

    expect(shareService.canManage).not.toHaveBeenCalled();
    expect(importService.createFromMultipart).toHaveBeenCalledWith(
      expect.anything(),
      undefined,
    );
  });
});
