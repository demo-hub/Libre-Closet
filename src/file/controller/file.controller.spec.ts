import { EntityManager } from '@mikro-orm/core';
import { getRepositoryToken } from '@mikro-orm/nestjs';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { Test, TestingModule } from '@nestjs/testing';
import { File } from '../../dal/entity/file.entity';
import { User } from '../../dal/entity/user.entity';
import { FileService } from '../file-service.abstract';
import { FileController } from './file.controller';
import { AuthService } from '../../auth/auth.service';
import type { FastifyRequest } from 'fastify';
import type { I18nContext } from 'nestjs-i18n';

describe('FileController', () => {
  let controller: FileController;
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
            get: jest.fn(),
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
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
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
