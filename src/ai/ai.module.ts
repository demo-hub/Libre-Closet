import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { AnthropicEnricher } from './anthropic.enricher';
import { GarmentEnricher } from './garment-enricher';
import { NullEnricher } from './null.enricher';
import { OpenAiEnricher } from './openai.enricher';

/**
 * Picks a provider from AI_PROVIDER, the way FileModule picks local or S3
 * storage. `none` is the default and answers nothing, so an instance that was
 * never configured behaves as though the feature does not exist.
 */
@Module({
  imports: [ConfigModule],
  providers: [
    {
      provide: GarmentEnricher,
      inject: [ConfigService],
      useFactory: (configService: ConfigService): GarmentEnricher => {
        switch (configService.get<string>('AI_PROVIDER', 'none')) {
          case 'anthropic':
            return new AnthropicEnricher(configService);
          case 'openai':
          case 'ollama':
            return new OpenAiEnricher(configService);
          default:
            return new NullEnricher();
        }
      },
    },
  ],
  exports: [GarmentEnricher],
})
export class AiModule {}
