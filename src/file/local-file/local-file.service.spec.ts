import { EntityManager } from '@mikro-orm/core';
import { getRepositoryToken } from '@mikro-orm/nestjs';
import { NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test, TestingModule } from '@nestjs/testing';
import fs from 'fs';
import { File } from '../../dal/entity/file.entity';
import { LocalFileService } from './local-file.service';

jest.mock('fs');

describe('LocalFileService', () => {
  let service: LocalFileService;

  beforeEach(async () => {
    jest.clearAllMocks();
    (fs.existsSync as jest.Mock).mockReturnValue(true);
    (fs.mkdirSync as jest.Mock).mockImplementation(() => {});

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        LocalFileService,
        {
          provide: ConfigService,
          useValue: {
            getOrThrow: jest.fn(() => ''),
          },
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
          provide: EntityManager,
          useValue: {
            query: jest.fn(),
            // you can mock other functions inside
            // the entity manager object, my case only needed query method
          },
        },
      ],
    }).compile();

    service = module.get<LocalFileService>(LocalFileService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it.each(['../.env', '../../etc/passwd', 'photos/../../x.webp'])(
    'finds nothing outside its directory for %p',
    async (fileName: string) => {
      await expect(service.get(fileName)).rejects.toBeInstanceOf(
        NotFoundException,
      );
      expect(fs.createReadStream).not.toHaveBeenCalled();
    },
  );

  it('reads a file in its directory', async () => {
    await service.get('2f1c.webp');

    expect(fs.createReadStream).toHaveBeenCalledWith(
      expect.stringMatching(/2f1c\.webp$/),
    );
  });
});
