import { EntityManager } from '@mikro-orm/core';
import { getRepositoryToken } from '@mikro-orm/nestjs';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import type { FastifyReply } from 'fastify';
import { Readable } from 'node:stream';
import { File } from '../../dal/entity/file.entity';
import { User } from '../../dal/entity/user.entity';
import { FileService } from '../file-service.abstract';
import { FileController } from './file.controller';
import { AuthService } from '../../auth/auth.service';

describe('FileController', () => {
  let controller: FileController;
  let fileService: { get: jest.Mock; getNobgVariant: jest.Mock };
  let fileRepository: { count: jest.Mock };

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
          useValue: {
            findOne: jest.fn(),
            find: jest.fn(),
            persistAndFlush: jest.fn(),
          },
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
});
