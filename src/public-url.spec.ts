import { FastifyRequest } from 'fastify';
import { publicBaseUrl, requestOrigin } from './public-url';

const req = {
  protocol: 'http',
  host: '192.168.1.10:3000',
  hostname: '192.168.1.10',
} as unknown as FastifyRequest;

describe('requestOrigin', () => {
  it('keeps the port', () => {
    expect(requestOrigin(req)).toBe('http://192.168.1.10:3000');
  });
});

describe('publicBaseUrl', () => {
  it('is the request’s own address when SITE_URL is unset or empty', () => {
    expect(publicBaseUrl(undefined, req)).toBe('http://192.168.1.10:3000');
    expect(publicBaseUrl('', req)).toBe('http://192.168.1.10:3000');
    expect(publicBaseUrl('   ', req)).toBe('http://192.168.1.10:3000');
  });

  it('is SITE_URL when set, without a trailing slash', () => {
    expect(publicBaseUrl('https://closet.example', req)).toBe(
      'https://closet.example',
    );
    expect(publicBaseUrl('https://closet.example/', req)).toBe(
      'https://closet.example',
    );
  });
});
