import { getRepositoryToken } from '@mikro-orm/nestjs';
import { Test, TestingModule } from '@nestjs/testing';
import type { FastifyRequest } from 'fastify';
import { File } from '../dal/entity/file.entity';
import { Garment } from '../dal/entity/garment.entity';
import { Outfit } from '../dal/entity/outfit.entity';
import { FileUrlService } from '../file/file-url/file-url.service';
import { OpenGraphService } from './open-graph.service';

describe('OpenGraphService', () => {
  let service: OpenGraphService;
  let files: { findOne: jest.Mock };
  let garments: { findOne: jest.Mock };
  let outfits: { findOne: jest.Mock };
  const req = {
    protocol: 'https',
    host: 'closet.example:8443',
  } as unknown as FastifyRequest;
  const base = 'https://closet.example:8443';

  beforeEach(async () => {
    files = { findOne: jest.fn() };
    garments = { findOne: jest.fn() };
    outfits = { findOne: jest.fn() };
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        OpenGraphService,
        FileUrlService,
        { provide: getRepositoryToken(File), useValue: files },
        { provide: getRepositoryToken(Garment), useValue: garments },
        { provide: getRepositoryToken(Outfit), useValue: outfits },
      ],
    }).compile();

    service = module.get<OpenGraphService>(OpenGraphService);
  });

  it('shows a garment without loading or naming its owner', async () => {
    const garment = { name: 'Camel coat', photo: { shareableId: 'photo-1' } };
    garments.findOne.mockResolvedValue(garment);

    const item = await service.getShareableTagValues('g-1', 'garment', req);

    expect(garments.findOne).toHaveBeenCalledWith(
      { shareableId: 'g-1' },
      { populate: ['photo'] },
    );
    expect(item).toEqual({
      ogUrl: `${base}/share?shareableId=g-1&type=garment`,
      ogImage: `${base}/file/watermark/photo-1`,
      ogImageWidth: undefined,
      ogImageHeight: undefined,
      garment,
    });
    expect(item).not.toHaveProperty('ogDescription');
    expect(item).not.toHaveProperty('createdBy');
  });

  it('keeps the default image for a garment without a photo', async () => {
    garments.findOne.mockResolvedValue({ name: 'Scarf', photo: null });

    const item = await service.getShareableTagValues('g-2', 'garment', req);

    expect(item).not.toHaveProperty('ogImage');
  });

  it('lists an outfit in slot order and previews its first photo', async () => {
    const shirt = { id: 1, photo: null };
    const coat = { id: 2, photo: { shareableId: 'coat-photo' } };
    outfits.findOne.mockResolvedValue({
      name: 'Office',
      garments: { getItems: () => [shirt, coat] },
      slots: [{ garmentId: 2 }, { garmentId: 1 }],
    });

    const item = await service.getShareableTagValues('o-1', 'outfit', req);

    expect(outfits.findOne).toHaveBeenCalledWith(
      { shareableId: 'o-1' },
      { populate: ['garments', 'garments.photo'] },
    );
    expect(item?.garments).toEqual([coat, shirt]);
    expect(item?.ogImage).toBe(`${base}/file/watermark/coat-photo`);
    expect(item?.ogUrl).toBe(`${base}/share?shareableId=o-1&type=outfit`);
    expect(item).not.toHaveProperty('ogDescription');
  });

  it('points a shared file at its share page, which exists', async () => {
    files.findOne.mockResolvedValue({ fileName: 'a.webp' });

    const item = await service.getShareableTagValues('f-1', 'file', req);

    expect(item?.ogUrl).toBe(`${base}/share?shareableId=f-1&type=file`);
    expect(item?.ogImage).toBe(`${base}/file/watermark/f-1`);
    expect(item).not.toHaveProperty('createdBy');
  });

  it.each([
    ['an unknown id', 'nope', 'garment'],
    ['an unknown type', 'g-1', 'shoe'],
    ['no id', undefined, 'garment'],
    ['an id given twice', ['a', 'b'], 'garment'],
  ])('finds nothing for %s', async (_, id, type) => {
    garments.findOne.mockResolvedValue(null);

    await expect(
      service.getShareableTagValues(id as string, type, req),
    ).resolves.toBeNull();
  });
});
