import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import type { MultipartFile } from '@fastify/multipart';
import type { FastifyRequest } from 'fastify';
import { randomUUID } from 'node:crypto';
import { File } from '../../dal/entity/file.entity';
import { Garment } from '../../dal/entity/garment.entity';
import { FileService } from '../../file/file-service.abstract';
import { normalizeColorInput } from '../color-input';
import { GarmentService } from '../garment.service';

type Fields = Record<string, string | string[]>;
type Settled<T> = { ok: true; value: T } | { ok: false; error: unknown };
type Uploads = {
  fileName: string;
  owner?: number;
  photo?: Promise<Settled<File>>;
  nobg?: Promise<Settled<void>>;
};

const settle = <T>(p: Promise<T>): Promise<Settled<T>> =>
  p.then(
    (value) => ({ ok: true as const, value }),
    (error: unknown) => ({ ok: false as const, error }),
  );

const first = (v: string | string[] | undefined): string | undefined =>
  Array.isArray(v) ? v[0] : v;

const failure = (r?: Settled<unknown>): Error | undefined => {
  if (!r || r.ok) return undefined;
  return r.error instanceof Error ? r.error : new Error(String(r.error));
};

@Injectable()
export class ImportService {
  private readonly logger = new Logger(ImportService.name);

  constructor(
    private readonly fileService: FileService,
    private readonly garmentService: GarmentService,
  ) {}

  /** Creates a garment from one multipart request carrying its fields, `photo` and an optional `nobgPhoto`. */
  async createFromMultipart(
    req: FastifyRequest,
    owner?: number,
  ): Promise<Garment> {
    const { fields, photo } = await this.consume(req, owner);
    const category = first(fields.category);
    if (!category) {
      if (photo) await this.fileService.discard(photo);
      throw new BadRequestException('category is required');
    }
    try {
      return await this.garmentService.create(
        {
          name: first(fields.name),
          category,
          brand: first(fields.brand),
          color: normalizeColorInput(fields.color),
          size: first(fields.size),
          notes: first(fields.notes),
          washingDetails: first(fields.washingDetails),
          dateAquired: first(fields.dateAquired),
          sourceUrl: first(fields.sourceUrl),
          photo,
        },
        owner,
      );
    } catch (err) {
      if (photo) await this.fileService.discard(photo);
      throw err;
    }
  }

  // Pipelines must start inside the loop or @fastify/multipart backpressures (see GarmentService.update).
  private async consume(
    req: FastifyRequest,
    owner?: number,
  ): Promise<{ fields: Fields; photo?: File }> {
    const uploads: Uploads = { fileName: `${randomUUID()}.webp`, owner };
    const fields: Fields = {};

    try {
      for await (const part of req.parts({ limits: { files: 2 } })) {
        if (part.type === 'file') this.startUpload(part, uploads);
        else this.addField(fields, part.fieldname, String(part.value));
      }
    } catch (err) {
      // The parser rejects on its own limits or a client abort; uploads already
      // started must still be settled and cleaned up before rethrowing.
      const orphan = await this.settleUploads(uploads).catch(() => undefined);
      if (orphan) await this.fileService.discard(orphan);
      throw err;
    }

    return { fields, photo: await this.settleUploads(uploads) };
  }

  private startUpload(part: MultipartFile, uploads: Uploads) {
    if (part.fieldname === 'photo' && part.filename && !uploads.photo) {
      uploads.photo = settle(
        this.fileService.storeImageFromFileUpload(
          part,
          uploads.owner,
          uploads.fileName,
        ),
      );
    } else if (
      part.fieldname === 'nobgPhoto' &&
      part.filename &&
      !uploads.nobg
    ) {
      uploads.nobg = settle(
        this.fileService.storeNobgVariantFromStream(
          part.file,
          uploads.fileName,
        ),
      );
    } else {
      part.file.resume();
    }
  }

  private async settleUploads(uploads: Uploads): Promise<File | undefined> {
    const [photo, nobg] = await Promise.all([uploads.photo, uploads.nobg]);
    const photoError = failure(photo);
    const nobgError = failure(nobg);
    if (nobgError) this.logger.warn(nobgError);
    // A cut-out without a usable original would never be served.
    if (nobg && (nobgError || photoError || !photo)) {
      await this.deleteNobgVariant(uploads.fileName);
    }
    if (photoError) {
      // The storage backend may have written part of the original before failing.
      await this.fileService
        .delete(uploads.fileName)
        .catch((err) => this.logger.warn(err));
      throw photoError;
    }
    return photo && photo.ok ? photo.value : undefined;
  }

  private addField(fields: Fields, name: string, value: string) {
    const existing = fields[name];
    if (existing === undefined) fields[name] = value;
    else if (Array.isArray(existing)) existing.push(value);
    else fields[name] = [existing, value];
  }

  private deleteNobgVariant(photoFileName: string): Promise<void> {
    return this.fileService
      .delete(this.fileService.nobgFileName(photoFileName))
      .catch((e) => this.logger.warn(e));
  }
}
