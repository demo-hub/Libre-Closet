import { ForbiddenException } from '@nestjs/common';
import type { I18nContext } from 'nestjs-i18n';
import { emptyPrefill } from './garment-prefill';
import { Test, TestingModule } from '@nestjs/testing';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { ConditionalAuthGuard } from '../../auth/conditional-auth.guard';
import { WardrobeShareService } from '../../wardrobe-share/wardrobe-share.service';
import { GarmentService } from '../garment.service';
import { ImportController, urlImportLimit } from './import.controller';
import { ImportService } from './import.service';
import { UrlImportService } from './url-import.service';

describe('ImportController', () => {
  let controller: ImportController;
  let importService: { createFromMultipart: jest.Mock };
  let urlImportService: { importFromUrl: jest.Mock; importImage: jest.Mock };
  let garmentService: {
    findAvailableFilters: jest.Mock;
    resolveCategoryLabel: jest.Mock;
  };
  let shareService: { canManage: jest.Mock };
  let reply: { redirect: jest.Mock; view: jest.Mock };

  const i18n = {
    lang: 'en',
    t(key: string) {
      return key;
    },
  } as unknown as I18nContext;

  const emptyResult = {
    prefill: emptyPrefill(),
    candidates: [],
    allCandidates: [],
  };

  const requestAs = (userId?: number) =>
    ({
      user: userId != null ? { userId } : undefined,
    }) as unknown as FastifyRequest;

  beforeEach(async () => {
    importService = {
      createFromMultipart: jest.fn().mockResolvedValue({ id: 7 }),
    };
    urlImportService = {
      importFromUrl: jest.fn().mockResolvedValue(emptyResult),
      importImage: jest.fn().mockResolvedValue({}),
    };
    garmentService = {
      findAvailableFilters: jest.fn().mockResolvedValue({
        categories: ['tops'],
        brands: ['Geisha'],
        sizes: [],
      }),
      resolveCategoryLabel: jest.fn((value: string) => value),
    };
    shareService = { canManage: jest.fn().mockResolvedValue(true) };
    reply = { redirect: jest.fn(), view: jest.fn() };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [ImportController],
      providers: [
        { provide: ImportService, useValue: importService },
        { provide: UrlImportService, useValue: urlImportService },
        { provide: GarmentService, useValue: garmentService },
        { provide: WardrobeShareService, useValue: shareService },
      ],
    })
      // Nest instantiates the controller's guard when compiling; the chain
      // itself is not exercised by direct method calls.
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

  describe('POST /wardrobe/import/url', () => {
    const fromUrl = (
      body: Record<string, unknown>,
      userId?: number,
      ownerId?: string,
    ) =>
      controller.fromUrl(
        body,
        requestAs(userId),
        reply as unknown as FastifyReply,
        i18n,
        ownerId,
      );

    it('renders the form rather than redirecting', async () => {
      await fromUrl({ url: 'https://shop.example/p/1' });
      expect(reply.view).toHaveBeenCalledWith(
        'wardrobe/form',
        expect.objectContaining({ garment: expect.anything() }),
      );
      expect(reply.redirect).not.toHaveBeenCalled();
    });

    it('answers 200 even when the import failed, so htmx swaps it', async () => {
      urlImportService.importFromUrl.mockResolvedValueOnce({
        ...emptyResult,
        failure: 'IMPORT_SITE_BLOCKED',
      });
      await fromUrl({ url: 'https://shop.example/p/1' });
      const [, model] = reply.view.mock.calls[0] as [
        string,
        Record<string, unknown>,
      ];
      expect(model.importFailure).toBe('IMPORT_SITE_BLOCKED');
      expect(model.importFailureMessage).toBe('lang.IMPORT_SITE_BLOCKED');
    });

    it('hands the wardrobe own categories and brands to the extractor', async () => {
      await fromUrl({ url: 'https://shop.example/p/1' });
      expect(urlImportService.importFromUrl).toHaveBeenCalledWith(
        'https://shop.example/p/1',
        expect.objectContaining({
          knownCategories: ['tops'],
          knownBrands: ['Geisha'],
          language: 'en',
        }),
      );
    });

    it('fetches only the picked image, and keeps the fields as posted', async () => {
      urlImportService.importImage.mockResolvedValueOnce({
        image: {
          dataUri: 'data:image/webp;base64,AA',
          hasAlpha: false,
          url: 'b',
        },
      });
      await fromUrl({
        imageUrl: 'https://cdn.example/b.jpg',
        candidates: 'https://cdn.example/a.jpg https://cdn.example/b.jpg',
        name: 'Edited by hand',
        color: ['beige', 'sage'],
        sourceUrl: 'https://shop.example/p/1',
      });

      expect(urlImportService.importFromUrl).not.toHaveBeenCalled();
      const [, model] = reply.view.mock.calls[0] as [
        string,
        Record<string, unknown>,
      ];
      expect((model.garment as Record<string, unknown>).name).toBe(
        'Edited by hand',
      );
      expect((model.garment as Record<string, unknown>).color).toBe(
        'beige,sage',
      );
      // The colour the palette has no swatch for stays checked.
      expect(model.customColors).toEqual(['sage']);
      // The one now on screen is not offered again; the other one is.
      expect(model.importCandidates).toEqual([
        { url: 'https://cdn.example/a.jpg', index: 1 },
      ]);
    });

    it('keeps the photo the user already has when a swap fails', async () => {
      urlImportService.importImage.mockResolvedValueOnce({
        failure: 'IMPORT_IMAGE_INVALID',
      });
      await fromUrl({
        imageUrl: 'https://cdn.example/b.jpg',
        candidates: 'https://cdn.example/a.jpg https://cdn.example/b.jpg',
        name: 'Edited by hand',
      });
      const [, model] = reply.view.mock.calls[0] as [
        string,
        Record<string, unknown>,
      ];
      expect(model.importFailure).toBe('IMPORT_IMAGE_INVALID');
      expect((model.garment as Record<string, unknown>).name).toBe(
        'Edited by hand',
      );
      // Both are still on offer: neither is on screen now.
      expect(model.importCandidates).toHaveLength(1);
    });

    it('keeps the pasted link even when nothing could be read', async () => {
      urlImportService.importFromUrl.mockResolvedValueOnce({
        ...emptyResult,
        failure: 'IMPORT_SITE_BLOCKED',
      });
      await fromUrl({ url: 'https://shop.example/p/1?utm_source=x' });
      const [, model] = reply.view.mock.calls[0] as [
        string,
        Record<string, unknown>,
      ];
      expect((model.garment as Record<string, unknown>).sourceUrl).toBe(
        'https://shop.example/p/1',
      );
      // And the box stays open, since the alert asks them to fix the link.
      expect(model.importOpen).toBe(true);
    });

    it('renders a date the form can display, whatever was posted', async () => {
      await fromUrl({
        imageUrl: 'https://cdn.example/b.jpg',
        dateAquired: 'x',
      });
      const [, model] = reply.view.mock.calls[0] as [
        string,
        Record<string, unknown>,
      ];
      expect((model.garment as Record<string, unknown>).dateAquired).toBe('');
    });

    it('reads only the first value when a field arrives twice', async () => {
      await fromUrl({
        imageUrl: ['https://cdn.example/b.jpg', 'https://evil.example/x.jpg'],
        name: ['first', 'second'],
      });
      expect(urlImportService.importImage).toHaveBeenCalledWith(
        'https://cdn.example/b.jpg',
        undefined,
      );
      const [, model] = reply.view.mock.calls[0] as [
        string,
        Record<string, unknown>,
      ];
      expect((model.garment as Record<string, unknown>).name).toBe('first');
    });

    it('carries the badges and the size list across a swap', async () => {
      await fromUrl({
        imageUrl: 'https://cdn.example/b.jpg',
        suggested: 'name brand',
        sizeOptions: 'S|M|One Size',
      });
      const [, model] = reply.view.mock.calls[0] as [
        string,
        Record<string, unknown>,
      ];
      expect(Object.keys(model.suggested as object)).toEqual(['name', 'brand']);
      expect(model.sizeOptions).toEqual(['S', 'M', 'One Size']);
    });

    it('does not put the user own id on every link it renders', async () => {
      await fromUrl({ url: 'https://shop.example/p/1' }, 5, '5');
      const [, model] = reply.view.mock.calls[0] as [
        string,
        Record<string, unknown>,
      ];
      expect(model.viewOwner).toBeUndefined();
    });

    it('keeps the shared wardrobe id when writing into one', async () => {
      await fromUrl({ url: 'https://shop.example/p/1' }, 5, '9');
      const [, model] = reply.view.mock.calls[0] as [
        string,
        Record<string, unknown>,
      ];
      expect(model.viewOwner).toBe(9);
    });

    it('refuses a shared wardrobe without manage permission', async () => {
      shareService.canManage.mockResolvedValueOnce(false);
      await expect(
        fromUrl({ url: 'https://shop.example/p/1' }, 5, '9'),
      ).rejects.toBeInstanceOf(ForbiddenException);
      expect(urlImportService.importFromUrl).not.toHaveBeenCalled();
    });

    it('is rate limited more tightly than saving is', () => {
      // Every import makes the server fetch a stranger's site, so it is not as
      // cheap as saving a garment already in hand.
      const saveLimit = Reflect.getMetadata(
        'THROTTLER:LIMITdefault',
        Object.getOwnPropertyDescriptor(ImportController.prototype, 'create')
          ?.value as object,
      ) as number;
      expect(urlImportLimit()).toBeLessThan(saveLimit);
    });

    it('takes its ceiling from the environment, read per request', () => {
      // A decorator argument is evaluated before .env is loaded, so the limit
      // has to be resolved when the request arrives or the setting is dead.
      const before = process.env.IMPORT_URL_RATE_LIMIT;
      try {
        process.env.IMPORT_URL_RATE_LIMIT = '60';
        expect(urlImportLimit()).toBe(60);
        process.env.IMPORT_URL_RATE_LIMIT = 'nonsense';
        expect(urlImportLimit()).toBe(10);
        delete process.env.IMPORT_URL_RATE_LIMIT;
        expect(urlImportLimit()).toBe(10);
      } finally {
        if (before === undefined) delete process.env.IMPORT_URL_RATE_LIMIT;
        else process.env.IMPORT_URL_RATE_LIMIT = before;
      }
    });

    it('hands the throttler a resolver, not a captured number', () => {
      const limit: unknown = Reflect.getMetadata(
        'THROTTLER:LIMITdefault',
        Object.getOwnPropertyDescriptor(ImportController.prototype, 'fromUrl')
          ?.value as object,
      );
      expect(typeof limit).toBe('function');
    });
  });
});
