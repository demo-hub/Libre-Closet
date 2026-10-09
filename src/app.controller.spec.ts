import { Test, TestingModule } from '@nestjs/testing';
import { AppController } from './app.controller';
import { I18nContext } from 'nestjs-i18n';
import { AppService } from './app.service';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { AuthService } from './auth/auth.service';

describe('AppController', () => {
  let appController: AppController;

  beforeEach(async () => {
    const app: TestingModule = await Test.createTestingModule({
      controllers: [AppController],
      providers: [
        AppService,
        ConfigService,
        JwtService,
        { provide: AuthService, useValue: { verifyPwf: jest.fn() } },
      ],
    }).compile();

    appController = app.get<AppController>(AppController);
  });

  describe('index', () => {
    it('should return a context object with translated pageTitle', () => {
      const i18n = { t: (key: string) => key } as unknown as I18nContext;
      expect(appController.index(i18n)).toEqual({
        pageTitle: 'lang.PAGE_TITLE_HOME',
        ogTitle: 'lang.PAGE_TITLE_HOME',
      });
    });
  });

  describe('chat', () => {
    afterEach(() => jest.useRealTimers());

    it('titles the page', () => {
      const i18n = { t: (key: string) => key } as unknown as I18nContext;
      expect(appController.getChat(i18n)).toEqual({ pageTitle: 'lang.CHAT' });
    });

    it('sends a message to every open chat as text, never as markup', async () => {
      jest.useFakeTimers();
      const sent: string[] = [];
      appController.getChatStream().subscribe((html) => sent.push(html));

      const done = appController.postMessages({
        message: '<img src=x onerror="alert(1)">',
      });
      await jest.runAllTimersAsync();
      await done;

      expect(sent[0]).toContain('&lt;img src&#x3D;x onerror&#x3D;&quot;');
      expect(sent.join('')).not.toContain('<img');
    });
  });
});
