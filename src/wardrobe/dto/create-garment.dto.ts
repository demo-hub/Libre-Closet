import { MultipartFile } from '@fastify/multipart';
import { File } from '../../dal/entity/file.entity';

export interface CreateGarmentDto {
  name?: string;
  category: string;
  brand?: string;
  color?: string;
  size?: string;
  notes?: string;
  washingDetails?: string;
  dateAquired?: string;
  files?: AsyncIterableIterator<MultipartFile>;
  photo?: File;
}
