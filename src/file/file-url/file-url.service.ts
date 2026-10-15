import { Injectable } from '@nestjs/common';
import { FastifyRequest } from 'fastify';

@Injectable()
export class FileUrlService {
  getFileUrl(fileName: string, req: FastifyRequest): string {
    if (fileName) {
      return `${req.protocol}://${req.host}/file/${fileName}`;
    } else {
      return fileName;
    }
  }

  /** `baseUrl` is where links to this instance point (see public-url.ts). */
  getWatermarkedFileUrl(shareableId: string, baseUrl: string): string {
    return `${baseUrl}/file/watermark/${shareableId}`;
  }
}
