import { Injectable } from '@nestjs/common';
import { GarmentEnricher, GarmentSuggestion } from './garment-enricher';

/** What runs by default: nothing leaves the server, and no button is shown. */
@Injectable()
export class NullEnricher extends GarmentEnricher {
  readonly host = '';
  readonly available = false;

  analyzeImage(): Promise<GarmentSuggestion | undefined> {
    return Promise.resolve(undefined);
  }
}
