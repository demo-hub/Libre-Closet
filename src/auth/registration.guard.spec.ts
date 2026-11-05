import { ExecutionContext, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { RegistrationGuard } from './registration.guard';

describe('RegistrationGuard', () => {
  let guard: RegistrationGuard;
  let configService: { get: jest.Mock };

  const settings = (values: Record<string, boolean | undefined>) =>
    configService.get.mockImplementation((key: string) => values[key]);

  const mockExecutionContext = () => {
    const response = { redirect: jest.fn() };
    return {
      switchToHttp: () => ({
        getResponse: () => response,
      }),
      response,
    } as unknown as ExecutionContext;
  };

  beforeEach(() => {
    configService = { get: jest.fn() };
    guard = new RegistrationGuard(configService as unknown as ConfigService);
  });

  it('allows access when DISABLE_REGISTRATION is false', () => {
    settings({ AUTH_ENABLED: true, DISABLE_REGISTRATION: false });
    const context = mockExecutionContext();

    expect(guard.canActivate(context)).toBe(true);
  });

  it('allows access when DISABLE_REGISTRATION is undefined', () => {
    settings({ AUTH_ENABLED: true });
    const context = mockExecutionContext();

    expect(guard.canActivate(context)).toBe(true);
  });

  it('redirects to /auth/login and blocks access when DISABLE_REGISTRATION is true', () => {
    settings({ AUTH_ENABLED: true, DISABLE_REGISTRATION: true });
    const context = mockExecutionContext();
    const response = context.switchToHttp().getResponse();

    expect(guard.canActivate(context)).toBe(false);
    expect(response.redirect).toHaveBeenCalledWith('/auth/login', 302);
  });

  it('answers 404 without accounts, whatever DISABLE_REGISTRATION says', () => {
    settings({ AUTH_ENABLED: false, DISABLE_REGISTRATION: true });
    const context = mockExecutionContext();

    expect(() => guard.canActivate(context)).toThrow(NotFoundException);
  });
});
