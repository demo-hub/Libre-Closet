import { EntityRepository } from '@mikro-orm/core';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { FastifyRequest } from 'fastify';
import { GarmentEnricher } from '../ai/garment-enricher';
import { User } from '../dal/entity/user.entity';
import { ViewContextService } from './view-context.service';

const request = {
  url: '/about?from=footer',
  headers: {},
  protocol: 'http',
  host: 'localhost:3000',
  hostname: 'localhost',
  cookies: {},
} as unknown as FastifyRequest;

const contextWith = (config: Record<string, unknown>) =>
  new ViewContextService(
    {} as EntityRepository<User>,
    {
      get: (key: string, fallback?: unknown) =>
        key in config ? config[key] : fallback,
    } as unknown as ConfigService,
    {} as JwtService,
    { available: false } as unknown as GarmentEnricher,
  ).buildContext(request);

describe('ViewContextService operator values', () => {
  it('are empty strings under the Joi defaults', async () => {
    const context = await contextWith({
      OPERATOR_NAME: '',
      OPERATOR_CONTACT: '',
    });
    expect(context.operatorName).toBe('');
    expect(context.operatorContact).toBe('');
  });

  it('are empty strings when the config has no such keys', async () => {
    const context = await contextWith({});
    expect(context.operatorName).toBe('');
    expect(context.operatorContact).toBe('');
  });

  it('pass the configured values through', async () => {
    const context = await contextWith({
      OPERATOR_NAME: 'Jane Doe',
      OPERATOR_CONTACT: 'closet@example.com',
    });
    expect(context.operatorName).toBe('Jane Doe');
    expect(context.operatorContact).toBe('closet@example.com');
  });
});

describe('ViewContextService links to this instance', () => {
  for (const SITE_URL of [undefined, '']) {
    it(`use the request's own address, port included, when SITE_URL is ${JSON.stringify(SITE_URL)}`, async () => {
      const context = await contextWith({ SITE_URL });
      expect(context.siteUrl).toBe('http://localhost:3000');
      expect(context.canonicalUrl).toBe('http://localhost:3000/about');
      expect(context.ogUrl).toBe('http://localhost:3000/about');
      expect(context.ogImage).toBe('http://localhost:3000/assets/og-image.png');
    });
  }

  it('use SITE_URL when it is set', async () => {
    const context = await contextWith({ SITE_URL: 'https://closet.example/' });
    expect(context.siteUrl).toBe('https://closet.example');
    expect(context.canonicalUrl).toBe('https://closet.example/about');
    expect(context.ogImage).toBe('https://closet.example/assets/og-image.png');
  });
});

describe('ViewContextService signed-in user', () => {
  const user = {
    id: 1,
    email: 'a@example.com',
    password: 'hash-ending-ABCDEFGH',
  };
  const contextFor = (payload: Record<string, unknown>) =>
    new ViewContextService(
      {
        findOne: jest.fn().mockResolvedValue(user),
      } as unknown as EntityRepository<User>,
      { get: () => undefined } as unknown as ConfigService,
      {
        verifyAsync: jest.fn().mockResolvedValue(payload),
      } as unknown as JwtService,
      { available: false } as unknown as GarmentEnricher,
    ).buildContext({ ...request, cookies: { access_token: 'token' } });

  it("is the token's user when the password fingerprint matches", async () => {
    const context = await contextFor({ userId: 1, pwf: 'ABCDEFGH' });
    expect(context.user).toBe(user);
  });

  const wrong: [string, Record<string, unknown>][] = [
    ['a wrong fingerprint', { userId: 1, pwf: 'XXXXXXXX' }],
    ['no fingerprint', { userId: 1 }],
  ];
  for (const [name, payload] of wrong) {
    it(`is nobody for a signed token with ${name}`, async () => {
      const context = await contextFor(payload);
      expect(context.user).toBeUndefined();
    });
  }
});
