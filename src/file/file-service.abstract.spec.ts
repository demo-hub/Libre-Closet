import { ConfigService } from '@nestjs/config';
import sharp from 'sharp';
import { Readable } from 'stream';
import { File } from '../dal/entity/file.entity';
import { FileService } from './file-service.abstract';

class TestFileService extends FileService {
  storeImageFromFileUpload(): Promise<File> {
    throw new Error('unused');
  }
  copyImage(): Promise<File | undefined> {
    throw new Error('unused');
  }
  delete(): Promise<void> {
    throw new Error('unused');
  }
  deleteById(): Promise<unknown> {
    throw new Error('unused');
  }
  get(): Promise<Readable | undefined> {
    throw new Error('unused');
  }
  getByShareableId(): Promise<Readable | undefined> {
    throw new Error('unused');
  }
  protected removeFileRecord(): Promise<void> {
    throw new Error('unused');
  }
  protected store(): Promise<void> {
    throw new Error('unused');
  }
}

const serviceWith = (iconName: string) =>
  new TestFileService({
    getOrThrow: () => iconName,
  } as unknown as ConfigService);

describe('the share watermark', () => {
  it('falls back to the default icon, warning once, when ICON_NAME names a missing file', async () => {
    const service = serviceWith('lazztech_icon.webp');
    const warn = jest
      .spyOn(service.logger, 'warn')
      .mockImplementation(() => undefined);

    const first = await service.getWatermark();
    await service.getWatermark();

    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn.mock.calls[0][0]).toContain('lazztech_icon.webp');
    expect(first).toEqual(
      await serviceWith('icons/icon-512.png').getWatermark(),
    );
  });

  it('is 150 px with a 20 px margin', async () => {
    const watermark = await serviceWith('icons/icon-512.png').getWatermark();
    const { width, height } = await sharp(watermark).metadata();
    expect([width, height]).toEqual([170, 170]);
  });

  it('uses the configured file when it exists', async () => {
    const service = serviceWith('icons/maskable-512.png');
    const warn = jest.spyOn(service.logger, 'warn');
    const watermark = await service.getWatermark();
    expect(warn).not.toHaveBeenCalled();
    expect(watermark).not.toEqual(
      await serviceWith('icons/icon-512.png').getWatermark(),
    );
  });
});
