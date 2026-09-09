import {
  Body,
  Controller,
  ForbiddenException,
  Post,
  Query,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import { minutes, Throttle } from '@nestjs/throttler';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { I18n, I18nContext } from 'nestjs-i18n';
import { ConditionalAuthGuard } from '../../auth/conditional-auth.guard';
import { Payload } from '../../auth/dto/payload.dto';
import { WardrobeShareService } from '../../wardrobe-share/wardrobe-share.service';
import { normalizeColorInput } from '../color-input';
import { buildFormModel, customOf, prefillToForm } from '../garment-form';
import { GarmentService } from '../garment.service';
import { sanitizeSourceUrl } from '../source-url';
import { cleanSourceUrl } from './garment-prefill';
import { ImportService } from './import.service';
import { SameOriginGuard } from './same-origin.guard';
import { UrlImportService } from './url-import.service';

/**
 * Resolved per request, not when the class is defined: a decorator argument is
 * evaluated before ConfigModule has read .env, so a limit captured there would
 * ignore the file the README tells people to put it in. Each import makes the
 * server fetch a stranger's site, so the ceiling is low by default.
 */
export const urlImportLimit = (): number => {
  const configured = Number(process.env.IMPORT_URL_RATE_LIMIT);
  return Number.isInteger(configured) && configured > 0 ? configured : 10;
};

@UseGuards(ConditionalAuthGuard, SameOriginGuard)
@Controller('wardrobe/import')
export class ImportController {
  constructor(
    private readonly importService: ImportService,
    private readonly urlImportService: UrlImportService,
    private readonly garmentService: GarmentService,
    private readonly shareService: WardrobeShareService,
  ) {}

  @Throttle({ default: { limit: 30, ttl: minutes(1) } })
  @Post()
  async create(
    @Req() req: FastifyRequest,
    @Res() reply: FastifyReply,
    @Query('ownerId') ownerId: string | undefined,
  ) {
    const owner = await this.resolveOwner(req, ownerId);
    const garment = await this.importService.createFromMultipart(req, owner);

    const params = new URLSearchParams({ created: '1' });
    const shared = sharedOwner(req, ownerId);
    if (shared) params.set('ownerId', String(shared));
    return reply.redirect(`/wardrobe/${garment.id}?${params}`, 302);
  }

  /**
   * Reads a pasted link into the same form, prefilled. Always 200, even when
   * the shop refused us: htmx does not swap an error response and nothing
   * listens for one, so a failure has to arrive as a page that says so.
   */
  @Throttle({ default: { limit: urlImportLimit, ttl: minutes(1) } })
  @Post('url')
  async fromUrl(
    @Body()
    body: {
      url?: string | string[];
      // Every one of these can arrive repeated, which urlencoded parsing turns
      // into an array; `first` is what keeps that from reaching the template.
      imageUrl?: string | string[];
      importUrl?: string | string[];
      candidates?: string | string[];
      suggested?: string | string[];
      sizeOptions?: string | string[];
      name?: string | string[];
      category?: string | string[];
      brand?: string | string[];
      color?: string | string[];
      size?: string | string[];
      notes?: string | string[];
      washingDetails?: string | string[];
      dateAquired?: string | string[];
      sourceUrl?: string | string[];
    },
    @Req() req: FastifyRequest,
    @Res() reply: FastifyReply,
    @I18n() i18n: I18nContext,
    @Query('ownerId') ownerId: string | undefined,
  ) {
    const owner = await this.resolveOwner(req, ownerId);
    const model = await buildFormModel(this.garmentService, i18n, owner, {
      // The shared wardrobe being written into, if any — not the user's own id,
      // which would put ?ownerId=<self> on every link the form renders.
      viewOwner: sharedOwner(req, ownerId),
    });

    // A candidate swap. The form comes back with the fields the user may
    // already have edited, so choosing another photo costs them nothing.
    if (body.imageUrl) {
      const { image, failure } = await this.urlImportService.importImage(
        first(body.imageUrl)!,
        first(body.sourceUrl),
      );
      const colors = normalizeColorInput(body.color);
      const candidates = listOf(body.candidates);
      return reply.view('wardrobe/form', {
        ...model,
        garment: {
          name: first(body.name),
          category: first(body.category),
          brand: first(body.brand),
          color: colors,
          size: first(body.size),
          notes: first(body.notes),
          washingDetails: first(body.washingDetails),
          dateAquired: renderableDate(first(body.dateAquired)),
          sourceUrl: sanitizeSourceUrl(first(body.sourceUrl)),
        },
        customColors: customOf(colors),
        importPreview: image,
        importCandidates: labelled(candidates, first(body.imageUrl)),
        allCandidates: candidates,
        importFailure: failure,
        importFailureMessage: failure && i18n.t(`lang.${failure}`),
        importUrl: first(body.importUrl),
        importOpen: true,
        // Carried across the swap, or choosing another photo would quietly
        // strip the badges and the shop's size list off the form.
        suggested: Object.fromEntries(
          listOf(body.suggested).map((field) => [field, 'jsonld']),
        ),
        suggestedFields: listOf(body.suggested).join(' '),
        sizeOptions: listOf(body.sizeOptions, '|'),
      });
    }

    const filters = await this.garmentService.findAvailableFilters(owner);
    const result = await this.urlImportService.importFromUrl(
      first(body.url) ?? '',
      {
        knownCategories: filters.categories,
        knownBrands: filters.brands,
        language: i18n.lang,
      },
    );

    const form = prefillToForm(result.prefill);
    return reply.view('wardrobe/form', {
      ...model,
      ...form,
      garment: {
        ...form.garment,
        // Even when nothing else could be read, the link is worth keeping: the
        // user can save it and fill the rest in by hand. Cleaned the way a
        // successful import cleans it, so a failure does not store the
        // campaign parameters a success would have dropped.
        sourceUrl: form.garment.sourceUrl ?? pastedLink(first(body.url)),
      },
      importPreview: result.image,
      // Nothing to offer when every one of them was just tried and refused.
      importCandidates:
        result.failure === 'IMPORT_IMAGE_INVALID'
          ? []
          : labelled(result.allCandidates, result.image?.url),
      allCandidates: result.allCandidates,
      importFailure: result.failure,
      // Translated here: the hbs `t` helper takes no arguments, and the
      // success line names the shop.
      importFailureMessage: result.failure && i18n.t(`lang.${result.failure}`),
      importedFrom: result.host,
      importedFromMessage:
        result.host &&
        i18n.t('lang.IMPORTED_FROM_ALERT', { args: { host: result.host } }),
      importUrl: first(body.url),
      // Left open: a failure asks the user to fix the link, which they cannot
      // do if the box has folded away with the link inside it.
      importOpen: true,
    });
  }

  /** The owner pattern from wardrobe.controller.ts, which every route repeats. */
  private async resolveOwner(
    req: FastifyRequest,
    ownerId: string | undefined,
  ): Promise<number | undefined> {
    const userId: number | undefined = (req['user'] as Payload | undefined)
      ?.userId;
    const viewOwner =
      userId != null && ownerId ? parseInt(ownerId, 10) : undefined;
    if (userId != null && viewOwner != null && viewOwner !== userId) {
      const canManage = await this.shareService.canManage(userId, viewOwner);
      if (!canManage) throw new ForbiddenException();
    }
    return viewOwner ?? userId;
  }
}

/** Set only when writing into someone else's wardrobe. */
const sharedOwner = (
  req: FastifyRequest,
  ownerId: string | undefined,
): number | undefined => {
  const userId = (req['user'] as Payload | undefined)?.userId;
  if (userId == null || !ownerId) return undefined;
  const parsed = parseInt(ownerId, 10);
  return Number.isNaN(parsed) || parsed === userId ? undefined : parsed;
};

const pastedLink = (input: string | undefined): string | undefined => {
  const safe = sanitizeSourceUrl(input);
  return safe ? cleanSourceUrl(safe) : undefined;
};

const first = (value: string | string[] | undefined): string | undefined =>
  Array.isArray(value) ? value[0] : value;

const listOf = (value: string | string[] | undefined, separator = ' ') =>
  (first(value) ?? '').split(separator).filter(Boolean);

/** The date input renders through a helper that throws on anything else. */
const renderableDate = (value: string | undefined): string =>
  value && !Number.isNaN(new Date(value).getTime()) ? value : '';

/**
 * The alternatives, each keeping the number it has in the page's own image
 * list, so a photo does not change its name when another one is chosen.
 */
const labelled = (candidates: string[], shown?: string) =>
  candidates
    .map((url, index) => ({ url, index: index + 1 }))
    .filter((candidate) => candidate.url !== shown);
