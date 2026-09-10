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
import { SharePermission } from '../../dal/entity/wardrobe-share.entity';
import { WardrobeShareService } from '../../wardrobe-share/wardrobe-share.service';
import { normalizeColorInput } from '../color-input';
import {
  buildFormModel,
  customOf,
  GarmentFormModel,
  prefillToForm,
} from '../garment-form';
import { truncate } from './garment-prefill';
import { GarmentService } from '../garment.service';
import { sanitizeSourceUrl } from '../source-url';
import { cleanSourceUrl } from './garment-prefill';
import { intakeImage, toDataUri } from './image-intake';
import { ImportService } from './import.service';
import { MAX_IMAGE_BYTES } from './safe-fetch.service';
import {
  pickSharedTitle,
  pickSharedUrl,
  type SharePayload,
} from './shared-payload';
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
    // The destination can also arrive in the body, because a share sheet
    // cannot put it on the URL. Whatever it says is checked the same way.
    const { garment, owner: saved } =
      await this.importService.createFromMultipart(req, owner, (chosen) =>
        this.resolveOwner(req, chosen),
      );

    const params = new URLSearchParams({ created: '1' });
    // The garment landed in someone else's wardrobe, so the page that shows it
    // needs to be asked for in that wardrobe too, or it answers 403.
    const shared = saved != null && saved !== userIdOf(req) ? saved : undefined;
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
      ownerId?: string | string[];
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
    // A destination chosen on the page is posted back with the fields, so it
    // survives a candidate swap rather than resetting to "my wardrobe".
    const chosen = ownerId ? undefined : first(body.ownerId);
    const model = await buildFormModel(this.garmentService, i18n, owner, {
      // The shared wardrobe being written into, if any — not the user's own id,
      // which would put ?ownerId=<self> on every link the form renders.
      viewOwner: sharedOwner(req, ownerId),
      destinations: ownerId
        ? []
        : (await this.manageableWardrobes(req)).map((d) => ({
            ...d,
            selected: String(d.id) === chosen,
          })),
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

  /**
   * Where an OS share sheet lands. The payload is whatever the sharing app felt
   * like sending, so nothing is assumed: a photo becomes the preview, a link is
   * imported, and a share with neither still opens a form with its title in it.
   *
   * Renders rather than redirects, because the payload only exists in this
   * request — PR 7b adds the service-worker stash that survives a redirect.
   */
  @Throttle({ default: { limit: urlImportLimit, ttl: minutes(1) } })
  @Post('share')
  async fromShare(
    @Req() req: FastifyRequest,
    @Res() reply: FastifyReply,
    @I18n() i18n: I18nContext,
  ) {
    // An OS share carries no query string, so there is no ?ownerId to read:
    // the destination is chosen on the page instead.
    const owner = await this.resolveOwner(req, undefined);
    const model = await buildFormModel(this.garmentService, i18n, owner, {
      destinations: await this.manageableWardrobes(req),
      importOpen: true,
    });

    let shared: { payload: SharePayload; photo?: Buffer };
    try {
      shared = await readSharedPayload(req);
    } catch {
      // The parser refuses a payload over its limits mid-stream, and a share is
      // a top-level navigation: without this the user gets a browser error page.
      return reply.view('wardrobe/form', {
        ...model,
        importFailure: 'IMPORT_IMAGE_INVALID',
        importFailureMessage: i18n.t('lang.IMPORT_IMAGE_INVALID'),
      });
    }

    const link = pickSharedUrl(shared.payload);
    // A photo is the garment itself, so it wins over fetching the page — but
    // the link it came with is still kept as the source.
    if (shared.photo) return this.sharedPhoto(reply, model, shared, i18n, link);

    if (!link) {
      // Nothing to fetch, but the share still opens the form: whatever the app
      // called the page is a better start than an empty box.
      const name = pickSharedTitle(shared.payload);
      return reply.view('wardrobe/form', {
        ...model,
        garment: { name: name && truncate(name) },
        suggested: name ? { name: 'title' } : {},
        suggestedFields: name ? 'name' : '',
      });
    }

    const filters = await this.garmentService.findAvailableFilters(owner);
    const result = await this.urlImportService.importFromUrl(link, {
      knownCategories: filters.categories,
      knownBrands: filters.brands,
      language: i18n.lang,
    });
    const form = prefillToForm(result.prefill);
    const fallbackName = pickSharedTitle(shared.payload);
    return reply.view('wardrobe/form', {
      ...model,
      ...form,
      garment: {
        ...form.garment,
        // The shop said nothing, but the sharing app did.
        name: form.garment.name ?? (fallbackName && truncate(fallbackName)),
        sourceUrl: form.garment.sourceUrl ?? pastedLink(link),
      },
      importPreview: result.image,
      importCandidates: labelled(result.allCandidates, result.image?.url),
      allCandidates: result.allCandidates,
      importFailure: result.failure,
      importFailureMessage: result.failure && i18n.t(`lang.${result.failure}`),
      importedFrom: result.host,
      importedFromMessage:
        result.host &&
        i18n.t('lang.IMPORTED_FROM_ALERT', { args: { host: result.host } }),
      importUrl: link,
    });
  }

  /** A shared photo is the garment itself: no fetching, straight to the preview. */
  private async sharedPhoto(
    reply: FastifyReply,
    model: GarmentFormModel,
    shared: { payload: SharePayload; photo?: Buffer },
    i18n: I18nContext,
    link?: string,
  ) {
    const name = pickSharedTitle(shared.payload);
    try {
      const image = await intakeImage(shared.photo!);
      return reply.view('wardrobe/form', {
        ...model,
        garment: { name: name && truncate(name), sourceUrl: pastedLink(link) },
        suggested: name ? { name: 'title' } : {},
        suggestedFields: name ? 'name' : '',
        importPreview: {
          dataUri: toDataUri(image),
          hasAlpha: image.hasAlpha,
          url: '',
        },
      });
    } catch {
      return reply.view('wardrobe/form', {
        ...model,
        garment: { name: name && truncate(name), sourceUrl: pastedLink(link) },
        importFailure: 'IMPORT_IMAGE_INVALID',
        importFailureMessage: i18n.t('lang.IMPORT_IMAGE_INVALID'),
      });
    }
  }

  /**
   * The wardrobes this user may write into. Only MANAGE shares: a VIEW share
   * would be offered and then refused on Save. "My wardrobe" is not in the
   * list — it is the empty choice, because canManage is false for a user's
   * own id, there being no share row to themselves.
   */
  private async manageableWardrobes(req: FastifyRequest) {
    const userId = userIdOf(req);
    if (userId == null) return [];
    const shares = await this.shareService.getInboundShares(userId);
    return shares
      .filter((share) => share.permission === SharePermission.MANAGE)
      .map((share) => {
        const grantor = share.grantor.unwrap();
        return {
          id: grantor.id,
          label: grantor.firstName || grantor.email || `#${grantor.id}`,
        };
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

const userIdOf = (req: FastifyRequest): number | undefined =>
  (req['user'] as Payload | undefined)?.userId;

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
 * Reads a share. Multipart is what a share target sends, but the same route
 * takes a plain form post so the flow can be driven without an installed PWA.
 */
async function readSharedPayload(
  req: FastifyRequest,
): Promise<{ payload: SharePayload; photo?: Buffer }> {
  if (!req.isMultipart()) {
    const body = (req.body ?? {}) as Record<string, string | string[]>;
    return {
      payload: {
        title: first(body.title),
        text: first(body.text),
        url: first(body.url),
      },
    };
  }

  const payload: SharePayload = {};
  let photo: Buffer | undefined;
  // The file cap is per request, because the global one allows 100 MB and a
  // share should never buffer that. The COUNT is deliberately generous: a
  // `files: 1` limit does not skip the second photo, it aborts the whole
  // request, and multi-select is one tap away in the Android share sheet.
  for await (const part of req.parts({
    limits: { files: 20, fileSize: MAX_IMAGE_BYTES },
  })) {
    if (part.type === 'file') {
      // Every part must be drained or the request stalls, even the ones past
      // the first, and even the one that turns out to be too big.
      const chunks: Buffer[] = [];
      try {
        for await (const chunk of part.file) {
          if (!photo) chunks.push(Buffer.from(chunk));
        }
      } catch {
        // Over the size cap. The shared link is still worth having, so this
        // is not the end of the share.
        continue;
      }
      if (!photo && !part.file.truncated && chunks.length) {
        photo = Buffer.concat(chunks);
      }
    } else if (
      part.fieldname === 'title' ||
      part.fieldname === 'text' ||
      part.fieldname === 'url'
    ) {
      payload[part.fieldname] ??= String(part.value);
    }
  }
  // Nothing is decided until the loop ends: the order of the parts is the
  // sharing app's choice, not ours.
  return { payload, photo };
}

/**
 * The alternatives, each keeping the number it has in the page's own image
 * list, so a photo does not change its name when another one is chosen.
 */
const labelled = (candidates: string[], shown?: string) =>
  candidates
    .map((url, index) => ({ url, index: index + 1 }))
    .filter((candidate) => candidate.url !== shown);
