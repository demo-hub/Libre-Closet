import { EntityRepository, FilterQuery, raw } from '@mikro-orm/core';
import { InjectRepository } from '@mikro-orm/nestjs';
import { randomUUID } from 'node:crypto';
import {
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { I18nContext } from 'nestjs-i18n';
import { Garment } from '../dal/entity/garment.entity';
import { File } from '../dal/entity/file.entity';
import { User } from '../dal/entity/user.entity';
import { FileService } from '../file/file-service.abstract';
import { MultipartFile } from '@fastify/multipart';
import { CreateGarmentDto } from './dto/create-garment.dto';
import { UpdateGarmentDto } from './dto/update-garment.dto';
import { SearchGarmentDto } from './dto/search-garment.dto';
import { sanitizeSourceUrl } from './source-url';
import { resolveCategoryLabel } from './category-label';
import { WardrobeShareService } from '../wardrobe-share/wardrobe-share.service';
import { normalizeColorInput } from './color-input';
import { parseDateInput } from './date-input';

const CANONICAL_SIZES = [
  'XX-Small',
  'X-Small',
  'Small',
  'Medium',
  'Large',
  'X-Large',
  'XX-Large',
  '3X-Large',
  '4X-Large',
  '5X-Large',
];

/** Escapes LIKE's wildcards, so a search for "50%" finds "50%" and not "50 cm". */
export function escapeLike(text: string): string {
  return text.replace(/[\\%_]/g, (c) => `\\${c}`);
}

/** A raw SQL condition as a filter key; the empty array is MikroORM's "no value". */
type RawCondition = Record<string, never[]>;

/**
 * A garment whose colours include this one as a whole item: "red" matches
 * "red,blue" and "blue,red" but not "darkred". Colours are stored
 * comma-joined in one clean form (normalizeColorInput), so wrapping the value
 * in commas makes every item end on one. Plain SQL that SQLite and Postgres
 * both run, with the escape stated (SQLite has none by default) and both sides
 * lower-cased, as SQLite's LIKE ignores case and Postgres's does not.
 */
function colorCondition(color: string): RawCondition {
  return {
    [raw(
      (alias) =>
        `lower(',' || ${alias}.color || ',') like lower(?) escape '\\'`,
      [`%,${escapeLike(color)},%`],
    )]: [],
  };
}

/** A garment whose column holds the text anywhere, in any case, wildcards taken literally. */
function containsCondition(
  column: 'name' | 'notes' | 'brand',
  text: string,
): RawCondition {
  return {
    [raw(
      (alias) => `lower(${alias}.${column}) like lower(?) escape '\\'`,
      [`%${escapeLike(text)}%`],
    )]: [],
  };
}

@Injectable()
export class GarmentService {
  private readonly logger = new Logger(GarmentService.name);

  constructor(
    @InjectRepository(Garment)
    private readonly garmentRepository: EntityRepository<Garment>,
    @InjectRepository(User)
    private readonly userRepository: EntityRepository<User>,
    private readonly fileService: FileService,
    private readonly shareService: WardrobeShareService,
  ) {}

  resolveCategoryLabel(value: string, i18n: I18nContext): string {
    return resolveCategoryLabel(value, i18n);
  }

  async findAll(
    userId?: number,
    dto: SearchGarmentDto = {},
    viewOwner?: number,
  ): Promise<Garment[]> {
    const normalizedSize = this.normalizeSize(dto.size);
    // Single strings by now: normalizeSearch drops a parameter sent twice.
    const { color, keyword } = dto;
    const searchConditions: FilterQuery<Garment> = {
      ...(dto.category ? { category: dto.category } : {}),
      ...(color ? colorCondition(color) : {}),
      ...(normalizedSize ? { size: normalizedSize } : {}),
      ...(dto.archived !== 'true' ? { archived: false } : {}),
      ...(keyword
        ? {
            $or: (['name', 'notes', 'brand'] as const).map((column) =>
              containsCondition(column, keyword),
            ),
          }
        : {}),
    };

    if (userId != null) {
      if (viewOwner != null && viewOwner !== userId) {
        return this.garmentRepository.find(
          { owner: { id: viewOwner }, ...searchConditions },
          { populate: ['photo'], orderBy: { id: 'DESC' } },
        );
      }
      return this.garmentRepository.find(
        { owner: { id: userId }, ...searchConditions },
        { populate: ['photo'], orderBy: { id: 'DESC' } },
      );
    }
    // AUTH_ENABLED=false: only return garments that belong to no user
    return this.garmentRepository.find(
      { owner: null, ...searchConditions },
      { populate: ['photo'], orderBy: { id: 'DESC' } },
    );
  }

  async findOne(
    id: number,
    userId?: number,
    viewOwner?: number,
  ): Promise<Garment> {
    const garment = await this.garmentRepository.findOne(id, {
      populate: ['photo', 'outfits'],
    });
    if (!garment) throw new NotFoundException('Garment not found');
    if (userId != null) {
      if (garment.owner?.id === userId) return garment;
      if (viewOwner != null && garment.owner?.id === viewOwner) {
        if (await this.shareService.canView(userId, viewOwner)) {
          return garment;
        }
      }
      throw new ForbiddenException();
    } else {
      if (garment.owner != null) throw new ForbiddenException();
    }
    return garment;
  }

  async findOneByShareableId(shareableId: string): Promise<Garment> {
    const garment = await this.garmentRepository.findOne(
      { shareableId },
      { populate: ['photo'] },
    );
    if (!garment) throw new NotFoundException('Garment not found');
    return garment;
  }

  async create(dto: CreateGarmentDto, userId?: number): Promise<Garment> {
    // Read first: a bad date must fail before a photo is stored.
    const dateAquired = parseDateInput(dto.dateAquired, 'dateAquired');
    let photo: File | undefined = dto.photo;
    if (dto.files) {
      for await (const file of dto.files) {
        if (file.fieldname === 'photo') {
          photo = await this.fileService.storeImageFromFileUpload(file, userId);
        } else {
          file.file.resume();
        }
      }
    }

    // Resolved first: repository.create() stages the entity, so a failure after
    // it would leave a half-built garment pending in the unit of work.
    const owner =
      userId != null ? await this.userRepository.findOneOrFail(userId) : null;

    const garment = this.garmentRepository.create({
      name: dto.name,
      category: dto.category,
      brand: dto.brand,
      color: normalizeColorInput(dto.color),
      size: this.normalizeSize(dto.size),
      notes: dto.notes,
      washingDetails: dto.washingDetails,
      dateAquired,
      sourceUrl: sanitizeSourceUrl(dto.sourceUrl),
      photo: photo ?? undefined,
    });

    if (owner) {
      garment.owner = owner as any;
    }

    await this.garmentRepository.getEntityManager().persistAndFlush(garment);
    return garment;
  }

  async clone(
    sourceId: number,
    dto: {
      name?: string;
      category: string;
      brand?: string;
      color?: string | string[];
      size?: string;
      notes?: string;
      sourceUrl?: string;
    },
    userId?: number,
  ): Promise<Garment> {
    const source = await this.garmentRepository.findOne(sourceId, {
      populate: ['photo'],
    });
    if (!source) throw new NotFoundException('Garment not found');

    let photo: File | undefined;
    if (source.photo?.fileName) {
      photo = await this.fileService.copyImage(source.photo.fileName, userId);
      if (photo) {
        const nobgSourceName = this.fileService.nobgFileName(
          source.photo.fileName,
        );
        const nobgStream = await this.fileService
          .get(nobgSourceName)
          .catch(() => undefined);
        if (nobgStream) {
          await this.fileService
            .storeNobgVariantFromStream(nobgStream, photo.fileName)
            .catch((err) => this.logger.warn(err));
        }
      }
    }

    const garment = this.garmentRepository.create({
      name: dto.name,
      category: dto.category,
      brand: dto.brand,
      color: normalizeColorInput(dto.color),
      size: this.normalizeSize(dto.size),
      notes: dto.notes,
      sourceUrl: sanitizeSourceUrl(dto.sourceUrl) ?? source.sourceUrl,
      photo: photo ?? undefined,
    });

    if (userId != null) {
      const user = await this.userRepository.findOneOrFail(userId);
      garment.owner = user as any;
    }

    await this.garmentRepository.getEntityManager().persistAndFlush(garment);
    return garment;
  }

  async findAvailableFilters(userId?: number): Promise<{
    brands: string[];
    sizes: string[];
    categories: string[];
    archivedCount: number;
  }> {
    const where = userId != null ? { owner: { id: userId } } : { owner: null };
    const garments = await this.garmentRepository.find(where);

    const brands = [
      ...new Set(garments.map((g) => g.brand).filter(Boolean) as string[]),
    ].sort();
    const allSizes = [
      ...new Set(garments.map((g) => g.size).filter(Boolean) as string[]),
    ];
    const sizes = allSizes.sort((a, b) => {
      const ai = CANONICAL_SIZES.indexOf(a);
      const bi = CANONICAL_SIZES.indexOf(b);
      if (ai === -1 && bi === -1) return a.localeCompare(b);
      if (ai === -1) return 1;
      if (bi === -1) return -1;
      return ai - bi;
    });

    const categories = [
      ...new Set(garments.map((g) => g.category).filter(Boolean)),
    ].sort();

    return {
      brands,
      sizes,
      categories,
      archivedCount: garments.filter((g) => g.archived).length,
    };
  }

  async update(
    id: number,
    dto: UpdateGarmentDto,
    userId?: number,
    requestingUserId?: number,
  ): Promise<Garment> {
    // Resolved before the body is touched, so a caller who may not edit this
    // garment cannot leave a stored blob behind. The iterator has not been
    // advanced yet, so this read does not backpressure the parser.
    const garment = await this.findOne(id, requestingUserId, userId);
    // Read before any photo is stored, as in create.
    const dateAquired =
      'dateAquired' in dto
        ? parseDateInput(dto.dateAquired, 'dateAquired')
        : undefined;

    let photo: File | undefined;
    if (dto.files) {
      // @fastify/multipart yields live streams; if a stream isn't consumed,
      // the parser backpressures and the async iterator hangs. Each file's
      // pipeline must be started (not awaited) inside the loop so busboy can
      // advance to the next part.
      //
      // IMPORTANT: photo and nobgPhoto pipelines must be started concurrently,
      // not sequentially. Both come from the same multipart request body —
      // awaiting one before starting the other would hang the iterator.
      let photoPromise: Promise<File> | undefined;
      let nobgPromise: Promise<void> | undefined;
      const photoFileName = `${randomUUID()}.webp`;

      for await (const file of dto.files) {
        if (file.fieldname === 'photo' && file.filename) {
          photoPromise = this.fileService.storeImageFromFileUpload(
            file,
            userId,
            photoFileName,
          );
        } else if (file.fieldname === 'nobgPhoto' && file.filename) {
          nobgPromise = this.fileService.storeNobgVariantFromStream(
            file.file,
            photoFileName,
          );
        } else {
          file.file.resume();
        }
      }

      // Both promises are always observed: an unselected photo input leaves
      // photoPromise undefined while a cut-out may still be in flight.
      [photo] = await Promise.all([
        photoPromise ?? Promise.resolve(undefined),
        nobgPromise?.catch((err) => this.logger.warn(err)) ?? Promise.resolve(),
      ]);

      if (nobgPromise && !photo) {
        // A cut-out without an original would never be served.
        await this.fileService
          .delete(this.fileService.nobgFileName(photoFileName))
          .catch((err) => this.logger.warn(err));
      }
    }

    if (photo) {
      await this.deleteOldPhoto(garment);
      garment.photo = photo as any;
    }

    garment.name = dto.name ?? garment.name;
    garment.category = dto.category ?? garment.category;
    if ('brand' in dto) garment.brand = dto.brand;
    if ('color' in dto)
      garment.color =
        dto.color === undefined ? undefined : normalizeColorInput(dto.color);
    if ('size' in dto) garment.size = this.normalizeSize(dto.size);
    if ('notes' in dto) garment.notes = dto.notes;
    if ('washingDetails' in dto) garment.washingDetails = dto.washingDetails;
    if ('dateAquired' in dto) garment.dateAquired = dateAquired;
    if ('sourceUrl' in dto)
      garment.sourceUrl = sanitizeSourceUrl(dto.sourceUrl);

    await this.garmentRepository.getEntityManager().flush();
    return garment;
  }

  private async deleteOldPhoto(garment: Garment) {
    const oldFileName = garment.photo?.fileName;
    if (oldFileName) {
      await this.fileService
        .delete(oldFileName)
        .catch((err) => this.logger.warn(err));
      const nobgFileName = this.fileService.nobgFileName(oldFileName);
      await this.fileService
        .delete(nobgFileName)
        .catch((err) => this.logger.warn(err));
    }
  }

  async updateNobg(
    id: number,
    nobgPhoto: MultipartFile | undefined,
    userId?: number,
    requestingUserId?: number,
  ): Promise<void> {
    const garment = await this.findOne(id, requestingUserId, userId);
    if (!garment.photo?.fileName) return;
    await this.streamNobgIfPresent(nobgPhoto, garment.photo.fileName);
  }

  private streamNobgIfPresent(
    nobgPhoto: MultipartFile | undefined,
    photoFileName: string,
  ): Promise<void> {
    if (!nobgPhoto) return Promise.resolve();
    const fileStream = nobgPhoto.file;
    return this.fileService.storeNobgVariantFromStream(
      fileStream,
      photoFileName,
    );
  }

  async remove(id: number, userId?: number): Promise<void> {
    const garment = await this.findOne(id, userId);
    await this.garmentRepository.getEntityManager().removeAndFlush(garment);
  }

  async archive(id: number, userId?: number): Promise<Garment> {
    const garment = await this.findOne(id, userId);
    garment.archived = !garment.archived;
    await this.garmentRepository.getEntityManager().flush();
    return garment;
  }

  private normalizeSize(input?: string): string | undefined {
    if (!input) return undefined;
    const s = input
      .trim()
      .toLowerCase()
      .replace(/[\s-]+/g, '');
    if (['xxxxxl', '5xl', '5xlarge', 'xxxxxlarge'].includes(s))
      return '5X-Large';
    if (['xxxxl', '4xl', '4xlarge', 'xxxxlarge'].includes(s)) return '4X-Large';
    if (['xxxl', '3xl', '3xlarge', 'xxxlarge'].includes(s)) return '3X-Large';
    if (['xxl', '2xl', '2xlarge', 'xxlarge'].includes(s)) return 'XX-Large';
    if (['xl', 'xlarge'].includes(s)) return 'X-Large';
    if (['l', 'large'].includes(s)) return 'Large';
    if (['m', 'medium'].includes(s)) return 'Medium';
    if (['s', 'small'].includes(s)) return 'Small';
    if (['xs', 'xsmall'].includes(s)) return 'X-Small';
    if (['xxs', '2xs', '2xsmall', 'xxsmall'].includes(s)) return 'XX-Small';
    return input.trim();
  }
}
