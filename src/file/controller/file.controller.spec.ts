import { EntityManager } from '@mikro-orm/core';
import { getRepositoryToken } from '@mikro-orm/nestjs';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { Test, TestingModule } from '@nestjs/testing';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { Readable } from 'node:stream';
import { File } from '../../dal/entity/file.entity';
import { User } from '../../dal/entity/user.entity';
import { FileService } from '../file-service.abstract';
import { FileController } from './file.controller';
import { AuthService } from '../../auth/auth.service';
import type { I18nContext } from 'nestjs-i18n';

describe('FileController', () => {
  let controller: FileController;
  let fileService: { get: jest.Mock; getNobgVariant: jest.Mock };
  let fileRepository: { count: jest.Mock };
  let users: { findOne: jest.Mock };
  const i18n = { t: (key: string) => key } as unknown as I18nContext;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [FileController],
      providers: [
        JwtService,
        {
          provide: FileService,
          useValue: {
            storeImageFromFileUpload: jest.fn(),
            delete: jest.fn(),
            deleteById: jest.fn(),
            get: jest.fn().mockResolvedValue(Readable.from(['image'])),
            getNobgVariant: jest.fn().mockResolvedValue(null),
            getByShareableId: jest.fn(),
            getWatermark: jest.fn(),
          },
        },
        ConfigService,
        {
          provide: AuthService,
          useValue: { verifyPwf: jest.fn() },
        },
        {
          provide: getRepositoryToken(File),
          useValue: {
            count: jest.fn().mockResolvedValue(0),
            findOne: jest.fn(),
            find: jest.fn(),
            persistAndFlush: jest.fn(),
          },
        },
        {
          provide: getRepositoryToken(User),
          useValue: (users = { findOne: jest.fn() }),
        },
        {
          provide: EntityManager,
          useValue: {
            query: jest.fn(),
            // you can mock other functions inside
            // the entity manager object, my case only needed query method
          },
        },
      ],
    }).compile();

    controller = module.get<FileController>(FileController);
    fileService = module.get(FileService);
    fileRepository = module.get(getRepositoryToken(File));
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('serving a file by name', () => {
    it.each(['sqlite3.db', '../.env', '..%2F.env'])(
      'answers 404 for %p, which no stored file has',
      async (fileName: string) => {
        await expect(controller.getFile(fileName)).rejects.toBeInstanceOf(
          NotFoundException,
        );
        await expect(
          controller.nobg(fileName, {} as FastifyReply),
        ).rejects.toBeInstanceOf(NotFoundException);
        expect(fileService.get).not.toHaveBeenCalled();
        expect(fileService.getNobgVariant).not.toHaveBeenCalled();
      },
    );

    it('serves a stored file', async () => {
      fileRepository.count.mockResolvedValue(1);

      await controller.getFile('2f1c.webp');

      expect(fileRepository.count).toHaveBeenCalledWith({
        fileName: '2f1c.webp',
      });
      expect(fileService.get).toHaveBeenCalledWith('2f1c.webp');
    });
  });

  it('has no files page without sign-in, where no one owns a file', async () => {
    await expect(controller.getFiles(undefined, i18n)).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('lists the signed-in user’s files under a title', async () => {
    const file = { fileName: 'a.webp' };
    users.findOne.mockResolvedValue({
      fileUploads: { getItems: () => [file] },
    });

    await expect(controller.getFiles({ userId: 1 }, i18n)).resolves.toEqual({
      files: [file],
      pageTitle: 'lang.FILES',
    });
  });

  it('refuses an upload that carries no file', async () => {
    const req = { file: () => Promise.resolve(undefined) };

    await expect(
      controller.uploadFile(
        { userId: 1 },
        req as unknown as FastifyRequest,
        i18n,
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});
