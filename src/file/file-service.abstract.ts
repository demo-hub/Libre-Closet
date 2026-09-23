import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { MultipartFile } from '@fastify/multipart';
import { existsSync } from 'fs';
import { join } from 'path';
import sharp from 'sharp';
import { File } from 'src/dal/entity/file.entity';
import Stream, { Readable } from 'stream';
import { FileServiceInterface } from './file-service.interface';

const DEFAULT_WATERMARK = 'icons/icon-512.png';

@Injectable()
export abstract class FileService implements FileServiceInterface {
  public logger = new Logger(FileService.name);

  private watermark?: Promise<Buffer>;

  constructor(readonly configService: ConfigService) {}

  public nobgFileName(fileName: string): string {
    const extIndex = fileName.lastIndexOf('.');
    return extIndex === -1
      ? `${fileName}-nobg`
      : `${fileName.slice(0, extIndex)}-nobg${fileName.slice(extIndex)}`;
  }

  async getNobgVariant(fileName: string): Promise<Readable | null> {
    const nobgName = this.nobgFileName(fileName);

    const existing = await this.get(nobgName).catch(() => undefined);
    if (existing) {
      return existing;
    }

    return null;
  }

  abstract storeImageFromFileUpload(
    upload: MultipartFile | undefined,
    userId: any,
    fileName?: string,
  ): Promise<File>;
  abstract copyImage(
    sourceFileName: string,
    userId?: number,
  ): Promise<File | undefined>;
  abstract delete(fileName: string): Promise<void>;

  /** Removes a stored image, its cut-out and its row. Best-effort: callers use it while handling another error. */
  async discard(file: File): Promise<void> {
    await this.delete(file.fileName).catch((err) => this.logger.warn(err));
    await this.delete(this.nobgFileName(file.fileName)).catch((err) =>
      this.logger.warn(err),
    );
    await this.removeFileRecord(file).catch((err) => this.logger.warn(err));
  }

  protected abstract removeFileRecord(file: File): Promise<void>;

  async storeNobgVariantFromStream(
    stream: Readable,
    originalFileName: string,
  ): Promise<void> {
    const nobgName = this.nobgFileName(originalFileName);
    const transformer = sharp()
      .webp({ quality: 100 })
      .resize(1080, 1080, { fit: sharp.fit.inside });
    const passThrough = new Stream.PassThrough();
    const storePromise = this.store(nobgName, passThrough);
    stream.on('error', (err) => passThrough.destroy(err));
    transformer.on('error', (err) => passThrough.destroy(err));
    stream.pipe(transformer).pipe(passThrough);
    await storePromise;
  }

  abstract deleteById(fileId: any, userId: any): Promise<any>;
  abstract get(fileName: string): Promise<Readable | undefined>;
  abstract getByShareableId(shareableId: string): Promise<Readable | undefined>;
  protected abstract store(fileName: string, stream: Readable): Promise<void>;

  /** A missing ICON_NAME file falls back to the default icon, so share previews keep working after the Lazztech icons went. */
  private watermarkSource(): string {
    const configured = this.configService.getOrThrow<string>('ICON_NAME');
    const file = join(process.cwd(), 'public', 'assets', configured);
    if (existsSync(file)) return file;
    this.logger.warn(
      `ICON_NAME "${configured}" is not a file under public/assets; watermarking with ${DEFAULT_WATERMARK}`,
    );
    return join(process.cwd(), 'public', 'assets', DEFAULT_WATERMARK);
  }

  getWatermark(): Promise<Buffer> {
    this.watermark ??= sharp(this.watermarkSource())
      .resize(150, 150)
      .extend({
        top: 0,
        bottom: 20,
        left: 20,
        right: 0,
        background: { r: 0, g: 0, b: 0, alpha: 0 },
      })
      .composite([
        {
          input: Buffer.from([0, 0, 0, 200]),
          raw: {
            width: 1,
            height: 1,
            channels: 4,
          },
          tile: true,
          blend: 'dest-in',
        },
      ])
      .toBuffer()
      .catch((error: unknown) => {
        this.watermark = undefined;
        throw error;
      });
    return this.watermark;
  }

  async watermarkImage(
    fileStream: Stream.Readable | undefined,
  ): Promise<Readable | undefined> {
    const watermark = await this.getWatermark();
    return fileStream?.pipe(
      sharp()
        .jpeg()
        .resize(1080, 1080, { fit: sharp.fit.inside })
        .composite([{ input: watermark, gravity: 'southwest' }]),
    );
  }
}
