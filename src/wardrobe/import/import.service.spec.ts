import { BadRequestException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import type { FastifyRequest } from 'fastify';
import { Readable } from 'node:stream';
import { File } from '../../dal/entity/file.entity';
import { FileService } from '../../file/file-service.abstract';
import { GarmentService } from '../garment.service';
import { ImportService } from './import.service';

const drain = async (stream: Readable) => {
  for await (const chunk of stream) void chunk;
};

const field = (fieldname: string, value: string) => ({
  type: 'field',
  fieldname,
  value,
});

const filePart = (
  fieldname: string,
  filename: string,
  chunks: Buffer[] = [Buffer.from('x')],
) => ({
  type: 'file',
  fieldname,
  filename,
  mimetype: 'image/png',
  file: Readable.from(chunks),
});

function request(
  parts: unknown[],
  onYield?: (index: number) => void,
): FastifyRequest {
  return {
    parts: () =>
      (function* () {
        for (const [i, p] of parts.entries()) {
          onYield?.(i);
          yield p;
        }
      })(),
  } as unknown as FastifyRequest;
}

describe('ImportService', () => {
  let service: ImportService;
  let fileService: {
    storeImageFromFileUpload: jest.Mock;
    storeNobgVariantFromStream: jest.Mock;
    discard: jest.Mock;
    delete: jest.Mock;
    nobgFileName: jest.Mock;
  };
  let garmentService: { create: jest.Mock };
  const stored = { fileName: 'stored.webp' } as File;

  beforeEach(async () => {
    fileService = {
      storeImageFromFileUpload: jest.fn(async (part: { file: Readable }) => {
        await drain(part.file);
        return stored;
      }),
      storeNobgVariantFromStream: jest.fn(async (stream: Readable) => {
        await drain(stream);
      }),
      discard: jest.fn().mockResolvedValue(undefined),
      delete: jest.fn().mockResolvedValue(undefined),
      nobgFileName: jest.fn((name: string) =>
        name.replace('.webp', '-nobg.webp'),
      ),
    };
    garmentService = {
      create: jest.fn((dto: object) => Promise.resolve({ id: 7, ...dto })),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ImportService,
        { provide: FileService, useValue: fileService },
        { provide: GarmentService, useValue: garmentService },
      ],
    }).compile();

    service = module.get(ImportService);
  });

  it('collects fields, stores the photo and creates the garment', async () => {
    const req = request([
      field('name', 'Tee'),
      field('category', 'tops'),
      field('color', 'red'),
      field('color', 'blue'),
      filePart('photo', 'a.png'),
    ]);

    const { garment } = await service.createFromMultipart(req, 3);

    expect(fileService.storeImageFromFileUpload).toHaveBeenCalledTimes(1);
    const [part, owner, fileName] = fileService.storeImageFromFileUpload.mock
      .calls[0] as [{ fieldname: string }, number, string];
    expect(part.fieldname).toBe('photo');
    expect(owner).toBe(3);
    expect(fileName).toMatch(/^[0-9a-f-]{36}\.webp$/);
    expect(garmentService.create).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'Tee',
        category: 'tops',
        color: 'red,blue',
        photo: stored,
      }),
      3,
    );
    expect(garment.id).toBe(7);
  });

  it('starts the photo pipeline before the next part is read', async () => {
    const callsWhenYielding: number[] = [];
    const req = request(
      [filePart('photo', 'a.png'), field('category', 'tops')],
      () =>
        callsWhenYielding.push(
          fileService.storeImageFromFileUpload.mock.calls.length,
        ),
    );

    await service.createFromMultipart(req);

    expect(callsWhenYielding).toEqual([0, 1]);
  });

  it('stores the cut-out beside the photo under the same file name', async () => {
    const req = request([
      field('category', 'tops'),
      filePart('photo', 'a.png'),
      filePart('nobgPhoto', 'nobg.webp'),
    ]);

    await service.createFromMultipart(req);

    const photoName = fileService.storeImageFromFileUpload.mock
      .calls[0][2] as string;
    expect(fileService.storeNobgVariantFromStream).toHaveBeenCalledWith(
      expect.any(Readable),
      photoName,
    );
  });

  it('drains unselected and unknown file parts without starting pipelines', async () => {
    const empty = filePart('nobgPhoto', '', []);
    const unknown = filePart('other', 'x.bin');
    const resumed = [
      jest.spyOn(empty.file, 'resume'),
      jest.spyOn(unknown.file, 'resume'),
    ];
    const req = request([
      field('category', 'tops'),
      filePart('photo', 'a.png'),
      empty,
      unknown,
    ]);

    await service.createFromMultipart(req);

    expect(fileService.storeNobgVariantFromStream).not.toHaveBeenCalled();
    resumed.forEach((spy) => expect(spy).toHaveBeenCalled());
  });

  it('creates a garment without a photo when none was chosen', async () => {
    const req = request([field('category', 'tops'), filePart('photo', '', [])]);

    await service.createFromMultipart(req);

    expect(fileService.storeImageFromFileUpload).not.toHaveBeenCalled();
    expect(garmentService.create).toHaveBeenCalledWith(
      expect.objectContaining({ category: 'tops', photo: undefined }),
      undefined,
    );
  });

  it('discards the stored photo when the garment cannot be saved', async () => {
    garmentService.create.mockRejectedValueOnce(new Error('db down'));
    const req = request([
      field('category', 'tops'),
      filePart('photo', 'a.png'),
    ]);

    await expect(service.createFromMultipart(req)).rejects.toThrow('db down');

    expect(fileService.discard).toHaveBeenCalledWith(stored);
  });

  it('rejects a missing category and discards the photo', async () => {
    const req = request([filePart('photo', 'a.png')]);

    await expect(service.createFromMultipart(req)).rejects.toBeInstanceOf(
      BadRequestException,
    );

    expect(fileService.discard).toHaveBeenCalledWith(stored);
    expect(garmentService.create).not.toHaveBeenCalled();
  });

  it('drops the cut-out when the original could not be stored', async () => {
    fileService.storeImageFromFileUpload.mockRejectedValueOnce(
      new Error('sharp: unsupported image'),
    );
    const req = request([
      field('category', 'tops'),
      filePart('photo', 'a.png'),
      filePart('nobgPhoto', 'nobg.webp'),
    ]);

    await expect(service.createFromMultipart(req)).rejects.toThrow(
      'sharp: unsupported image',
    );

    const deleted = fileService.delete.mock.calls.map(([n]) => n as string);
    expect(deleted.some((n) => n.endsWith('-nobg.webp'))).toBe(true);
  });

  it('drops a cut-out that arrives without a photo', async () => {
    const req = request([
      field('category', 'tops'),
      filePart('nobgPhoto', 'nobg.webp'),
    ]);

    await service.createFromMultipart(req);

    const deleted = fileService.delete.mock.calls.map(([n]) => n as string);
    expect(deleted.some((n) => n.endsWith('-nobg.webp'))).toBe(true);
  });

  it('discards an in-flight upload when the parser fails mid-request', async () => {
    const parserError = new Error('FST_FILES_LIMIT');
    const req = {
      parts: () =>
        (function* () {
          yield field('category', 'tops');
          yield filePart('photo', 'a.png');
          throw parserError;
        })(),
    } as unknown as FastifyRequest;

    await expect(service.createFromMultipart(req)).rejects.toThrow(
      'FST_FILES_LIMIT',
    );

    expect(fileService.discard).toHaveBeenCalledWith(stored);
    expect(garmentService.create).not.toHaveBeenCalled();
  });

  it('removes a half-written original when storing the photo fails', async () => {
    fileService.storeImageFromFileUpload.mockRejectedValueOnce(
      new Error('sharp: unsupported image'),
    );
    const req = request([
      field('category', 'tops'),
      filePart('photo', 'a.png'),
    ]);

    await expect(service.createFromMultipart(req)).rejects.toThrow(
      'sharp: unsupported image',
    );

    const [name] = fileService.delete.mock.calls.at(-1) as [string];
    expect(name).toMatch(/^[0-9a-f-]{36}\.webp$/);
    expect(garmentService.create).not.toHaveBeenCalled();
  });

  describe('a destination named in the body', () => {
    it('stores the photo against the wardrobe the field chose', async () => {
      const chooseOwner = jest.fn().mockResolvedValue(9);
      const req = request([
        field('ownerId', '9'),
        field('category', 'tops'),
        filePart('photo', 'coat.png'),
      ]);

      const { owner } = await service.createFromMultipart(req, 3, chooseOwner);

      expect(chooseOwner).toHaveBeenCalledWith('9');
      // Resolved before the photo was stored, which is when the owner matters.
      expect(fileService.storeImageFromFileUpload).toHaveBeenCalledWith(
        expect.anything(),
        9,
        expect.any(String),
      );
      expect(owner).toBe(9);
    });

    it('keeps the session owner when the body names none', async () => {
      const chooseOwner = jest.fn();
      const req = request([
        field('category', 'tops'),
        filePart('photo', 'coat.png'),
      ]);

      const { owner } = await service.createFromMultipart(req, 3, chooseOwner);

      expect(chooseOwner).not.toHaveBeenCalled();
      expect(owner).toBe(3);
    });
  });
});
