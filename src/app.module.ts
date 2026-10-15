import { MikroORM } from '@mikro-orm/core';
import { Logger, Module, OnModuleInit } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { APP_FILTER, APP_GUARD } from '@nestjs/core';
import * as path from 'path';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { configSchema } from './config.schema';
import { AuthModule } from './auth/auth.module';
import { DalModule } from './dal/dal.module';
import { NotificationModule } from './notification/notification.module';
import { FileModule } from './file/file.module';
import { EmailModule } from './email/email.module';
import { AcceptLanguageResolver, I18nModule } from 'nestjs-i18n';
import { OpenGraphModule } from './open-graph/open-graph.module';
import { WardrobeModule } from './wardrobe/wardrobe.module';
import { WardrobeShareModule } from './wardrobe-share/wardrobe-share.module';
import { MikroOrmModule } from '@mikro-orm/nestjs';
import { User } from './dal/entity/user.entity';
import { minutes, ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { LoggerModule } from 'nestjs-pino';
import { ErrorViewFilter } from './error-view.filter';
import { ViewContextModule } from './view-context/view-context.module';

@Module({
  imports: [
    LoggerModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => {
        const options = {
          singleLine: true,
          colorize: true,
          levelFirst: false,
          translateTime: 'yyyy-mm-dd HH:MM:ss',
          destination: 1,
        };
        return {
          pinoHttp: {
            transport: {
              targets: [
                {
                  target: 'pino-pretty',
                  level: 'info',
                  options,
                },
                {
                  target: 'pino-pretty',
                  level: 'info',
                  options: {
                    ...options,
                    // app.log file in data path
                    destination: path.join(
                      configService.getOrThrow('DATA_PATH'),
                      'app.log',
                    ),
                    mkdir: true,
                  },
                },
              ],
            },
          },
        };
      },
    }),
    ConfigModule.forRoot({
      envFilePath: ['.env.local', '.env'],
      validationSchema: configSchema,
      validationOptions: {
        abortEarly: true,
      },
      isGlobal: true,
    }),
    I18nModule.forRoot({
      fallbackLanguage: 'en',
      resolvers: [AcceptLanguageResolver],
      loaderOptions: {
        path: path.join(__dirname, '/i18n/'),
        watch: process.env.NODE_ENV !== 'production',
      },
      // only try to build types output types in src directory if the NODE_ENV is not 'production'
      typesOutputPath:
        process.env.NODE_ENV !== 'production'
          ? path.join(__dirname, '../src/generated/i18n.generated.ts')
          : undefined,
      viewEngine: 'hbs',
    }),
    MikroOrmModule.forFeature([User]),
    // https://docs.nestjs.com/security/rate-limiting
    ThrottlerModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => [
        {
          name: 'default',
          ttl: minutes(1),
          limit: config.get<number>('THROTTLE_LIMIT') ?? 600,
        },
      ],
    }),
    DalModule,
    AuthModule,
    FileModule,
    EmailModule,
    NotificationModule,
    OpenGraphModule,
    WardrobeModule,
    WardrobeShareModule,
    ViewContextModule,
  ],
  controllers: [AppController],
  providers: [
    AppService,
    // https://docs.nestjs.com/security/rate-limiting#rate-limiting
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard,
    },
    {
      provide: APP_FILTER,
      useClass: ErrorViewFilter,
    },
  ],
})
export class AppModule implements OnModuleInit {
  public logger = new Logger(AppModule.name);

  constructor(
    private readonly orm: MikroORM,
    private readonly configService: ConfigService,
  ) {}

  async onModuleInit(): Promise<void> {
    this.logger.log(`NODE_ENV: ${this.configService.get('NODE_ENV')}`);
    this.logger.log(`DATA_PATH: ${this.configService.get('DATA_PATH')}`);
    await this.orm.migrator.up();
  }
}
