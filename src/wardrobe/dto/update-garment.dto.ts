import { MultipartFile } from '@fastify/multipart';

export interface UpdateGarmentDto {
  name?: string;
  category?: string;
  brand?: string;
  /** One string or one per checkbox; the service normalises either. */
  color?: string | string[];
  size?: string;
  notes?: string;
  washingDetails?: string;
  dateAquired?: string;
  sourceUrl?: string;
  files?: AsyncIterableIterator<MultipartFile>;
}
