import { GarmentColor } from '../garment-color.enum';
import { containsWord, fold, matchAt } from './text-match';

/**
 * Colour words a shop might state, in the six languages the app speaks, mapped
 * onto the palette the form offers. Deliberately conservative: a word that is
 * not here becomes a custom colour rather than a wrong guess.
 */
const SYNONYMS: Record<GarmentColor, string[]> = {
  [GarmentColor.RED]: [
    'red',
    'crimson',
    'scarlet',
    'cherry',
    'ruby',
    'burgundy',
    'bordeaux',
    'maroon',
    'wine',
    'oxblood',
    'brick',
    'rosso',
    'bordo',
    'rouge',
    'bordeaux',
    'rot',
    'weinrot',
    'rojo',
    'granate',
    'burdeos',
    'красный',
    'бордовый',
    'вишнёвый',
    'алый',
  ],
  [GarmentColor.PINK]: [
    'pink',
    'blush',
    'fuchsia',
    'magenta',
    'salmon',
    'coral',
    'rose',
    'dusty pink',
    'hot pink',
    'rosa',
    'fucsia',
    'cipria',
    'altrosa',
    'rosado',
    'розовый',
    'фуксия',
    'коралловый',
  ],
  [GarmentColor.ORANGE]: [
    'orange',
    'tangerine',
    'apricot',
    'peach',
    'rust',
    'terracotta',
    'copper',
    'burnt orange',
    'arancione',
    'arancio',
    'naranja',
    'оранжевый',
    'терракотовый',
    'персиковый',
  ],
  [GarmentColor.YELLOW]: [
    'yellow',
    'mustard',
    'lemon',
    'ochre',
    'ocher',
    'canary',
    'honey',
    'giallo',
    'senape',
    'jaune',
    'moutarde',
    'gelb',
    'senf',
    'amarillo',
    'mostaza',
    'жёлтый',
    'желтый',
    'горчичный',
    'лимонный',
  ],
  [GarmentColor.GREEN]: [
    'green',
    'olive',
    'khaki',
    'sage',
    'mint',
    'emerald',
    'forest',
    'lime',
    'army',
    'moss',
    'pistachio',
    'jade',
    'teal',
    'seafoam',
    'verde',
    'oliva',
    'salvia',
    'menta',
    'smeraldo',
    'vert',
    'sauge',
    'menthe',
    'grün',
    'gruen',
    'oliv',
    'salbei',
    'smaragd',
    'caqui',
    'esmeralda',
    'зелёный',
    'зеленый',
    'оливковый',
    'хаки',
    'мятный',
    'изумрудный',
    'салатовый',
  ],
  [GarmentColor.BLUE]: [
    'blue',
    'navy',
    'cobalt',
    'royal blue',
    'sky blue',
    'baby blue',
    'light blue',
    'indigo',
    'denim',
    'turquoise',
    'aqua',
    'petrol',
    'midnight',
    'sapphire',
    'azure',
    'blu',
    'azzurro',
    'celeste',
    'indaco',
    'turchese',
    'bleu',
    'marine',
    'azur',
    'blau',
    'marineblau',
    'dunkelblau',
    'hellblau',
    'türkis',
    'tuerkis',
    'azul',
    'marino',
    'añil',
    'turquesa',
    'синий',
    'голубой',
    'индиго',
    'бирюзовый',
    'лазурный',
    'васильковый',
  ],
  [GarmentColor.PURPLE]: [
    'purple',
    'violet',
    'lilac',
    'lavender',
    'plum',
    'mauve',
    'aubergine',
    'eggplant',
    'amethyst',
    'orchid',
    'viola',
    'lilla',
    'lavanda',
    'prugna',
    'melanzana',
    'malva',
    'lilas',
    'prune',
    'pourpre',
    'lila',
    'violett',
    'flieder',
    'lavendel',
    'morado',
    'púrpura',
    'violeta',
    'ciruela',
    'berenjena',
    'фиолетовый',
    'сиреневый',
    'лиловый',
    'лавандовый',
    'пурпурный',
    'баклажан',
  ],
  [GarmentColor.BLACK]: [
    'black',
    'jet black',
    'onyx',
    'nero',
    'noir',
    'schwarz',
    'negro',
    'чёрный',
    'черный',
  ],
  [GarmentColor.WHITE]: [
    'white',
    'off-white',
    'optic white',
    'ivory',
    'snow',
    'chalk',
    'eggshell',
    'bianco',
    'avorio',
    'blanc',
    'ivoire',
    'weiß',
    'weiss',
    'elfenbein',
    'blanco',
    'marfil',
    'hueso',
    'белый',
    'айвори',
    'молочный',
  ],
  [GarmentColor.GREY]: [
    'grey',
    'gray',
    'charcoal',
    'slate',
    'heather',
    'ash',
    'graphite',
    'anthracite',
    'pewter',
    'smoke',
    'marl',
    'gunmetal',
    'grigio',
    'antracite',
    'grafite',
    'gris',
    'chiné',
    'ardoise',
    'grau',
    'anthrazit',
    'hellgrau',
    'dunkelgrau',
    'antracita',
    'grafito',
    'marengo',
    'серый',
    'графитовый',
    'антрацит',
    'меланж',
  ],
  [GarmentColor.BEIGE]: [
    'beige',
    'tan',
    'camel',
    'sand',
    'stone',
    'oatmeal',
    'nude',
    'taupe',
    'ecru',
    'cream',
    'biscuit',
    'wheat',
    'natural',
    'mushroom',
    'greige',
    'sabbia',
    'cammello',
    'tortora',
    'panna',
    'sable',
    'crème',
    'creme',
    'chamois',
    'natur',
    'arena',
    'crudo',
    'crema',
    'бежевый',
    'песочный',
    'кэмел',
    'таупе',
    'телесный',
    'кремовый',
    'экрю',
  ],
  [GarmentColor.BROWN]: [
    'brown',
    'chocolate',
    'coffee',
    'mocha',
    'espresso',
    'cognac',
    'chestnut',
    'tobacco',
    'walnut',
    'cocoa',
    'mahogany',
    'caramel',
    'hazel',
    'sienna',
    'marrone',
    'cioccolato',
    'caffè',
    'moka',
    'castagna',
    'cuoio',
    'tabacco',
    'nocciola',
    'marron',
    'brun',
    'chocolat',
    'café',
    'braun',
    'dunkelbraun',
    'hellbraun',
    'schokolade',
    'kaffee',
    'mokka',
    'kastanie',
    'karamell',
    'marrón',
    'castaño',
    'coñac',
    'коричневый',
    'шоколадный',
    'кофейный',
    'мокко',
    'коньячный',
    'каштановый',
    'табачный',
    'карамельный',
  ],
  [GarmentColor.GOLD]: [
    'gold',
    'golden',
    'gilt',
    'brass',
    'champagne',
    'oro',
    'dorato',
    'or',
    'doré',
    'dore',
    'dorado',
    'золотой',
    'золотистый',
  ],
  [GarmentColor.SILVER]: [
    'silver',
    'chrome',
    'platinum',
    'steel',
    'metallic',
    'argento',
    'argentato',
    'argent',
    'argenté',
    'silber',
    'plata',
    'plateado',
    'серебряный',
    'серебристый',
    'металлик',
  ],
  [GarmentColor.PATTERN]: [],
  [GarmentColor.OTHER]: [],
};

const PATTERN_WORDS = [
  'multicolour',
  'multicolor',
  'multi-coloured',
  'multi-colored',
  'multi colour',
  'multi color',
  'print',
  'printed',
  'floral',
  'stripe',
  'striped',
  'stripes',
  'plaid',
  'check',
  'checked',
  'checkered',
  'tartan',
  'gingham',
  'houndstooth',
  'polka dot',
  'dotted',
  'leopard',
  'animal print',
  'snake',
  'zebra',
  'camo',
  'camouflage',
  'paisley',
  'tie-dye',
  'colour-block',
  'color-block',
  'colorblock',
  'ombre',
  'graphic',
  'patterned',
  'jacquard',
  'argyle',
  'herringbone',
  'fantasia',
  'multicolore',
  'stampa',
  'stampato',
  'righe',
  'rigato',
  'quadri',
  'scozzese',
  'floreale',
  'pois',
  'leopardato',
  'animalier',
  'mimetico',
  'imprimé',
  'motif',
  'rayé',
  'rayures',
  'carreaux',
  'écossais',
  'fleuri',
  'léopard',
  'bunt',
  'mehrfarbig',
  'gemustert',
  'muster',
  'gestreift',
  'streifen',
  'kariert',
  'karo',
  'geblümt',
  'blumen',
  'gepunktet',
  'punkte',
  'estampado',
  'estampada',
  'rayas',
  'cuadros',
  'flores',
  'lunares',
  'leopardo',
  'camuflaje',
  'разноцветный',
  'мультиколор',
  'принт',
  'полоска',
  'клетка',
  'цветочный',
  'горошек',
  'леопардовый',
  'камуфляж',
  'узор',
];

/**
 * Brands whose names contain a colour word. Removed before matching so a
 * "Off-White hoodie" is not filed as white.
 */
const BRAND_NOISE = [
  'off-white',
  'off white',
  'black diamond',
  'red wing',
  'golden goose',
  'silver cross',
  'white stuff',
  'blue blue japan',
  'grey goose',
  'brown thomas',
  'orange culture',
  'green day',
  'true religion',
];

// Longest first, so "light blue" wins over "blue" and "off-white" over "white".
const ENTRIES = Object.entries(SYNONYMS)
  .flatMap(([color, words]) =>
    words.map((word) => ({ color: color as GarmentColor, word: fold(word) })),
  )
  .sort((a, b) => b.word.length - a.word.length);

/**
 * Too common an English word to match inside a longer phrase: "or" is French
 * for gold, and "Rain or Shine Parka" is not a gold garment.
 */
const EXACT_ONLY = new Set(['or']);

/**
 * The colour a token is really about. English compounds put the head last, so
 * "rose gold" is gold and "steel blue" is blue; a tie goes to the longer word,
 * which is what keeps "light blue" from being read as two colours.
 */
const bestMatch = (token: string): GarmentColor | undefined => {
  let best: { color: GarmentColor; end: number; length: number } | undefined;
  for (const entry of ENTRIES) {
    const at = EXACT_ONLY.has(entry.word)
      ? token === entry.word
        ? 0
        : -1
      : matchAt(token, entry.word);
    if (at === -1) continue;
    const end = at + entry.word.length;
    if (!best || end > best.end) {
      best = { color: entry.color, end, length: entry.word.length };
    }
  }
  return best?.color;
};

/** Shops write "White/Navy", "red and blue", "красный и синий". */
const SEPARATORS =
  /[/,&|]|(?<![\p{L}\p{N}])(?:and|e|et|und|y|и)(?![\p{L}\p{N}])/giu;

/** A colour field is a handful of short words; the rest is someone playing. */
const MAX_TEXT = 512;
const MAX_TOKENS = 12;
const MAX_TOKEN = 64;

const tokenize = (value: string): string[] =>
  value
    .split(SEPARATORS)
    .map((token) => token.trim().slice(0, MAX_TOKEN))
    .filter(Boolean)
    .slice(0, MAX_TOKENS);

export interface MappedColors {
  colors: GarmentColor[];
  /** Words the page stated that the palette has no place for. */
  custom: string[];
}

/**
 * Maps colour text onto the palette. Descriptions are not worth scanning: care
 * instructions and marketing copy produce false positives.
 *
 * `explicit` says the text came from a colour field rather than a product
 * name. Only then are unmatched words kept as custom colours, or a name like
 * "Off-White hoodie" would file "hoodie" as one.
 */
export function mapColors(
  text: string,
  { brand, explicit = false }: { brand?: string; explicit?: boolean } = {},
): MappedColors {
  // A colour field saying "Off-White" means the colour, so nothing is stripped
  // out of it; a product name is where a brand reads as a colour.
  const noise = explicit ? [] : [...(brand ? [brand] : []), ...BRAND_NOISE];
  const stated = text.slice(0, MAX_TEXT);
  let haystack = fold(stated);
  for (const word of noise) {
    haystack = haystack.split(fold(word)).join(' ');
  }

  const colors: GarmentColor[] = [];
  const custom: string[] = [];

  if (PATTERN_WORDS.some((word) => containsWord(haystack, fold(word)))) {
    colors.push(GarmentColor.PATTERN);
  }

  const tokens = tokenize(haystack);
  // A custom colour is shown back to the user, so it keeps the page's spelling
  // rather than the folded one; the token lists line up because an explicit
  // field has nothing stripped out of it.
  const spellings = explicit ? tokenize(stated.normalize('NFC')) : [];
  const spelling = (index: number, folded: string) =>
    spellings.length === tokens.length ? (spellings[index] ?? folded) : folded;

  for (const [index, token] of tokens.entries()) {
    const hit = bestMatch(token);
    if (hit) {
      if (!colors.includes(hit)) colors.push(hit);
    } else if (explicit && token.length <= 24 && /^[\p{L}\s-]+$/u.test(token)) {
      custom.push(spelling(index, token));
    }
  }

  return { colors: colors.slice(0, 3), custom: custom.slice(0, 3) };
}
