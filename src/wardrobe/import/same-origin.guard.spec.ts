import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { SameOriginGuard } from './same-origin.guard';

const context = (headers: Record<string, string>) =>
  ({
    switchToHttp: () => ({ getRequest: () => ({ headers }) }),
  }) as unknown as ExecutionContext;

describe('SameOriginGuard', () => {
  const guard = new SameOriginGuard();

  it('allows a request the browser labels as same-origin', () => {
    expect(
      guard.canActivate(context({ 'sec-fetch-site': 'same-origin' })),
    ).toBe(true);
    expect(guard.canActivate(context({ 'sec-fetch-site': 'same-site' }))).toBe(
      true,
    );
  });

  it('allows a share-sheet POST, which arrives with no initiator', () => {
    expect(guard.canActivate(context({ 'sec-fetch-site': 'none' }))).toBe(true);
  });

  it('allows a non-browser client that sends neither header', () => {
    expect(guard.canActivate(context({ host: 'closet.example' }))).toBe(true);
  });

  it('allows an Origin matching the host when the browser sends no metadata', () => {
    expect(
      guard.canActivate(
        context({ origin: 'https://closet.example', host: 'closet.example' }),
      ),
    ).toBe(true);
  });

  it('refuses a request driven from another site', () => {
    expect(() =>
      guard.canActivate(
        context({ 'sec-fetch-site': 'cross-site', host: 'closet.example' }),
      ),
    ).toThrow(ForbiddenException);
  });

  it('refuses an Origin belonging to someone else', () => {
    expect(() =>
      guard.canActivate(
        context({ origin: 'https://evil.example', host: 'closet.example' }),
      ),
    ).toThrow(ForbiddenException);
  });

  it('refuses a malformed Origin rather than guessing', () => {
    expect(() =>
      guard.canActivate(
        context({ origin: 'not a url', host: 'closet.example' }),
      ),
    ).toThrow(ForbiddenException);
  });
});
