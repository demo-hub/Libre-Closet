import { NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test, TestingModule } from '@nestjs/testing';
import type { FastifyRequest } from 'fastify';
import type { I18nContext } from 'nestjs-i18n';
import { OpenGraphController } from './open-graph.controller';
import { OpenGraphService } from './open-graph.service';

describe('OpenGraphController', () => {
  let controller: OpenGraphController;
  let service: { getShareableTagValues: jest.Mock };
  const req = {} as FastifyRequest;
  const i18n = {
    t(key: string, options?: { args?: Record<string, unknown> }) {
      return options?.args ? `${key} ${JSON.stringify(options.args)}` : key;
    },
  } as unknown as I18nContext;
  const sharedFrom = 'lang.SHARED_FROM {"appName":"Libre Closet"}';
  const ogUrl = 'https://closet.example/share?shareableId=x&type=garment';

  beforeEach(async () => {
    service = { getShareableTagValues: jest.fn() };
    const module: TestingModule = await Test.createTestingModule({
      controllers: [OpenGraphController],
      providers: [
        { provide: OpenGraphService, useValue: service },
        {
          provide: ConfigService,
          useValue: {
            get: (key: string) =>
              key === 'APP_NAME' ? 'Libre Closet' : undefined,
          },
        },
      ],
    }).compile();

    controller = module.get<OpenGraphController>(OpenGraphController);
  });

  it('answers 404 when there is nothing to show', async () => {
    service.getShareableTagValues.mockResolvedValue(null);

    await expect(
      controller.share('nope', 'garment', req, i18n),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('says where a garment was shared from, on the page and in the preview', async () => {
    service.getShareableTagValues.mockResolvedValue({
      ogUrl,
      garment: { name: 'Camel coat', category: 'outerwear' },
    });

    const page = await controller.share('x', 'garment', req, i18n);

    expect(page).toMatchObject({
      sharedFrom,
      ogDescription: sharedFrom,
      pageTitle: 'Camel coat',
      ogTitle: 'Camel coat',
      categoryLabel: 'lang.CATEGORY_OUTERWEAR',
      canonicalUrl: ogUrl,
    });
  });

  it('titles an unnamed garment by its category', async () => {
    service.getShareableTagValues.mockResolvedValue({
      ogUrl,
      garment: { name: null, category: 'my-coats' },
    });

    const page = await controller.share('x', 'garment', req, i18n);

    expect(page.pageTitle).toBe('my-coats');
  });

  it('names an untitled outfit and each of its garments', async () => {
    const photo = { fileName: 'p.webp' };
    service.getShareableTagValues.mockResolvedValue({
      ogUrl,
      outfit: { name: '' },
      garments: [
        { name: 'Navy polo', category: 'tops', photo },
        { name: null, category: 'footwear', photo: null },
      ],
    });

    const page = await controller.share('x', 'outfit', req, i18n);

    expect(page.pageTitle).toBe('lang.UNTITLED_OUTFIT');
    expect(page.garments).toEqual([
      { label: 'Navy polo', photo },
      { label: 'lang.CATEGORY_FOOTWEAR', photo: null },
    ]);
  });

  it('titles a file by its name', async () => {
    service.getShareableTagValues.mockResolvedValue({
      ogUrl,
      file: { fileName: 'a.webp' },
    });

    const page = await controller.share('x', 'file', req, i18n);

    expect(page.pageTitle).toBe('a.webp');
  });
});
