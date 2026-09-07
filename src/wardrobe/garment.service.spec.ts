import { EntityManager } from '@mikro-orm/core';
import { getRepositoryToken } from '@mikro-orm/nestjs';
import { ForbiddenException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { Readable } from 'node:stream';
import { Garment } from '../dal/entity/garment.entity';
import { User } from '../dal/entity/user.entity';
import { FileService } from '../file/file-service.abstract';
import { WardrobeShareService } from '../wardrobe-share/wardrobe-share.service';
import { GarmentService } from './garment.service';

const filePart = (fieldname: string, filename: string) => ({
  fieldname,
  filename,
  mimetype: 'image/png',
  file: Readable.from([Buffer.from('x')]),
});

const files = (parts: unknown[]) =>
  (function* () {
    for (const p of parts) yield p;
  })() as unknown as AsyncIterableIterator<never>;

describe('GarmentService', () => {
  let service: GarmentService;
  let garmentRepository: { findOne: jest.Mock; getEntityManager: jest.Mock };
  let fileService: {
    storeImageFromFileUpload: jest.Mock;
    storeNobgVariantFromStream: jest.Mock;
    delete: jest.Mock;
    nobgFileName: jest.Mock;
  };
  let flush: jest.Mock;

  const garmentOwnedBy = (ownerId: number | null) =>
    ({ id: 1, owner: ownerId == null ? null : { id: ownerId } }) as Garment;

  beforeEach(async () => {
    flush = jest.fn().mockResolvedValue(undefined);
    garmentRepository = {
      findOne: jest.fn().mockResolvedValue(garmentOwnedBy(null)),
      getEntityManager: jest.fn(() => ({ flush })),
    };
    fileService = {
      storeImageFromFileUpload: jest.fn().mockResolvedValue({
        fileName: 'stored.webp',
      }),
      storeNobgVariantFromStream: jest.fn().mockResolvedValue(undefined),
      delete: jest.fn().mockResolvedValue(undefined),
      nobgFileName: jest.fn((n: string) => n.replace('.webp', '-nobg.webp')),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        GarmentService,
        { provide: getRepositoryToken(Garment), useValue: garmentRepository },
        {
          provide: getRepositoryToken(User),
          useValue: { findOneOrFail: jest.fn() },
        },
        { provide: FileService, useValue: fileService },
        {
          provide: WardrobeShareService,
          useValue: { canView: jest.fn().mockResolvedValue(false) },
        },
        { provide: EntityManager, useValue: { flush } },
      ],
    }).compile();

    service = module.get(GarmentService);
  });

  describe('update', () => {
    it('ignores an unselected photo input instead of storing an empty file', async () => {
      const empty = filePart('photo', '');
      const resumed = jest.spyOn(empty.file, 'resume');

      await service.update(1, { files: files([empty]) });

      expect(fileService.storeImageFromFileUpload).not.toHaveBeenCalled();
      expect(resumed).toHaveBeenCalled();
    });

    it('drops a cut-out that arrives without an original', async () => {
      await service.update(1, {
        files: files([filePart('photo', ''), filePart('nobgPhoto', 'n.webp')]),
      });

      expect(fileService.storeNobgVariantFromStream).toHaveBeenCalled();
      const [deleted] = fileService.delete.mock.calls.at(-1) as [string];
      expect(deleted).toMatch(/-nobg\.webp$/);
    });

    it('survives a cut-out whose upload rejects', async () => {
      fileService.storeNobgVariantFromStream.mockRejectedValueOnce(
        new Error('sharp: empty buffer'),
      );

      await expect(
        service.update(1, {
          files: files([
            filePart('photo', 'a.png'),
            filePart('nobgPhoto', 'n.webp'),
          ]),
        }),
      ).resolves.toBeDefined();
    });

    it('refuses a garment the caller cannot edit before storing anything', async () => {
      garmentRepository.findOne.mockResolvedValue(garmentOwnedBy(42));

      await expect(
        service.update(1, { files: files([filePart('photo', 'a.png')]) }, 7, 7),
      ).rejects.toBeInstanceOf(ForbiddenException);

      expect(fileService.storeImageFromFileUpload).not.toHaveBeenCalled();
    });
  });
});
