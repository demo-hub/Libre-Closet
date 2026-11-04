import { Logger } from '@nestjs/common';
import { mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { configSchema } from './config.schema';

describe('configSchema', () => {
  let dataPath: string;
  const validate = (env: Record<string, string>) =>
    configSchema.validate(
      { DATA_PATH: dataPath, ...env },
      { abortEarly: true },
    );

  beforeAll(() => Logger.overrideLogger(false));

  beforeEach(() => {
    dataPath = mkdtempSync(join(tmpdir(), 'lc-config-'));
  });

  afterEach(() => {
    rmSync(dataPath, { recursive: true, force: true });
  });

  describe('TZ', () => {
    it('takes a time zone and may be left out', () => {
      expect(validate({}).value.TZ).toBeUndefined();
      expect(validate({ TZ: '' }).value.TZ).toBe('');
      expect(validate({ TZ: 'Europe/Lisbon' }).value.TZ).toBe('Europe/Lisbon');
    });

    it('counts a value it cannot use as unset rather than stopping the app', () => {
      const warn = jest
        .spyOn(Logger.prototype, 'warn')
        .mockImplementation(() => undefined);

      const { error, value } = validate({ TZ: ':/etc/localtime' });

      expect(error).toBeUndefined();
      expect(value.TZ).toBe('');
      expect(warn).toHaveBeenCalledWith(
        expect.stringContaining(':/etc/localtime'),
      );
      warn.mockRestore();
    });
  });

  describe('SITE_URL', () => {
    it('has no default, so links use the address a request came in on', () => {
      expect(validate({}).value.SITE_URL).toBeUndefined();
      expect(validate({ SITE_URL: '' }).value.SITE_URL).toBe('');
    });

    it('takes an https or http address, trimmed and without a trailing slash', () => {
      expect(
        validate({ SITE_URL: 'https://closet.example/' }).value.SITE_URL,
      ).toBe('https://closet.example');
      expect(
        validate({ SITE_URL: ' http://192.168.1.10:3000 ' }).value.SITE_URL,
      ).toBe('http://192.168.1.10:3000');
    });

    it('refuses something that is not an address', () => {
      expect(validate({ SITE_URL: 'closet.example' }).error).toBeDefined();
      expect(
        validate({ SITE_URL: 'ftp://closet.example' }).error,
      ).toBeDefined();
    });
  });

  it('trims OPERATOR_NAME and OPERATOR_CONTACT, so spaces count as unset', () => {
    const { value } = validate({
      OPERATOR_NAME: '   ',
      OPERATOR_CONTACT: ' jane@example.com ',
    });
    expect(value.OPERATOR_NAME).toBe('');
    expect(value.OPERATOR_CONTACT).toBe('jane@example.com');
  });
});
