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

  /**
   * Creates a garment from one multipart request carrying its fields, `photo`
   * and an optional `nobgPhoto`.
   *
   * `chooseOwner` lets the request name its own destination: a share sheet
   * cannot put `?ownerId` on the URL, so the form carries it as a field. It is
   * called with whatever the body said and must answer with the owner to use,
   * or throw — and it is awaited before the photo starts being stored, since
   * that is when the owner is needed.
   */
  async createFromMultipart(
    req: FastifyRequest,
    owner?: number,
    chooseOwner?: (ownerId: string) => Promise<number | undefined>,
  ): Promise<{ garment: Garment; owner?: number }> {
    const {
      fields,
      photo,
      owner: chosen,
    } = await this.consume(req, owner, chooseOwner);
    const category = first(fields.category);
    if (!category) {
      if (photo) await this.fileService.discard(photo);
      throw new BadRequestException('category is required');
    }
    try {
      const garment = await this.garmentService.create(
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
        chosen,
      );
      return { garment, owner: chosen };
    } catch (err) {
      if (photo) await this.fileService.discard(photo);
      throw err;
    }
  }

  // Pipelines must start inside the loop or @fastify/multipart backpressures (see GarmentService.update).
  private async consume(
    req: FastifyRequest,
    owner?: number,
    chooseOwner?: (ownerId: string) => Promise<number | undefined>,
  ): Promise<{ fields: Fields; photo?: File; owner?: number }> {
    const uploads: Uploads = { fileName: `${randomUUID()}.webp`, owner };
    const fields: Fields = {};

    try {
      for await (const part of req.parts({ limits: { files: 2 } })) {
        if (part.type === 'file') this.startUpload(part, uploads);
        else {
          const value = String(part.value);
          this.addField(fields, part.fieldname, value);
          // Awaiting here is safe where awaiting around a file part is not: a
          // field is fully buffered by the parser, so nothing is streaming.
          // The form puts this control above the photo, and a form is
          // serialised in tree order, so the answer is settled before the
          // first byte of the photo arrives.
          if (part.fieldname === 'ownerId' && chooseOwner && value) {
            const chosen = await chooseOwner(value);
            // The form puts this control above the photo so it arrives first.
            // A request that says otherwise has already had bytes written
            // against the wrong owner, and guessing which one was meant is
            // worse than refusing.
            if (uploads.photo && chosen !== uploads.owner) {
              throw new BadRequestException('ownerId arrived after the photo');
            }
            uploads.owner = chosen;
          }
        }
      }
    } catch (err) {
      // The parser rejects on its own limits or a client abort; uploads already
      // started must still be settled and cleaned up before rethrowing.
      const orphan = await this.settleUploads(uploads).catch(() => undefined);
      if (orphan) await this.fileService.discard(orphan);
      throw err;
    }

    return {
      fields,
      photo: await this.settleUploads(uploads),
      owner: uploads.owner,
    };
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
