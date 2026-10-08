import { EntityRepository } from '@mikro-orm/core';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { FastifyRequest } from 'fastify';
import { GarmentEnricher } from '../ai/garment-enricher';
import { User } from '../dal/entity/user.entity';
import { ViewContextService } from './view-context.service';

const request = {
  url: '/about',
  headers: {},
  protocol: 'http',
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
