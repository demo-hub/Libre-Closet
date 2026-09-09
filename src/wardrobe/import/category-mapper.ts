import { GarmentCategory } from '../garment-category.enum';
import { containsWord, fold, wordsPattern } from './text-match';

/**
 * The only place that decides what a garment is called. Kept isolated because
 * upstream is still weighing a fixed hierarchy against multiple categories per
 * garment, and either would replace this wholesale.
 *
 * Order matters: the first group whose word appears wins, so "top handle bag"
 * is a bag before it is a top.
 */
const KEYWORDS: [GarmentCategory, string[]][] = [
  [
    GarmentCategory.BAGS,
    [
      'bag',
      'handbag',
      'tote',
      'backpack',
      'rucksack',
      'crossbody',
      'shoulder bag',
      'clutch',
      'satchel',
      'bum bag',
      'belt bag',
      'fanny pack',
      'duffel',
      'holdall',
      'briefcase',
      'pouch',
      'weekender',
      'bucket bag',
      'borsa',
      'borse',
      'zaino',
      'tracolla',
      'pochette',
      'marsupio',
      'shopper',
      'sac',
      'sac à dos',
      'cabas',
      'banane',
      'besace',
      'sacoche',
      'tasche',
      'handtasche',
      'umhängetasche',
      'gürteltasche',
      'bolso',
      'bolsa',
      'mochila',
      'bandolera',
      'riñonera',
      'сумка',
      'рюкзак',
      'клатч',
      'шоппер',
      'портфель',
    ],
  ],
  [
    GarmentCategory.FOOTWEAR,
    [
      'shoe',
      'shoes',
      'sneaker',
      'sneakers',
      'trainer',
      'trainers',
      'boots',
      'bootie',
      'sandal',
      'sandals',
      'loafer',
      'loafers',
      'heel',
      'heels',
      'pump',
      'pumps',
      'mule',
      'mules',
      'slipper',
      'slippers',
      'flip-flop',
      'slides',
      'clog',
      'espadrille',
      'oxfords',
      'brogue',
      'derby',
      'moccasin',
      'footwear',
      'scarpa',
      'scarpe',
      'stivali',
      'stivaletti',
      'sandali',
      'mocassini',
      'ciabatte',
      'infradito',
      'calzature',
      'tacchi',
      'chaussure',
      'chaussures',
      'baskets',
      'bottes',
      'bottines',
      'sandales',
      'mocassins',
      'escarpins',
      'tongs',
      'schuh',
      'schuhe',
      'stiefel',
      'stiefeletten',
      'sandalen',
      'halbschuhe',
      'hausschuhe',
      'turnschuhe',
      'zapato',
      'zapatos',
      'zapatilla',
      'zapatillas',
      'deportivas',
      'botas',
      'botines',
      'sandalias',
      'mocasines',
      'tacones',
      'chanclas',
      'calzado',
      'обувь',
      'кроссовки',
      'кеды',
      'ботинки',
      'сапоги',
      'туфли',
      'сандалии',
      'лоферы',
      'мокасины',
      'тапочки',
    ],
  ],
  [
    GarmentCategory.ACCESSORIES,
    [
      'hat',
      'cap',
      'beanie',
      'beret',
      'bucket hat',
      'scarf',
      'snood',
      'belt',
      'gloves',
      'mittens',
      'socks',
      'tights',
      'sunglasses',
      'glasses',
      'watch',
      'jewellery',
      'jewelry',
      'necklace',
      'bracelet',
      'earrings',
      'ring',
      'brooch',
      'tie',
      'bow tie',
      'hair clip',
      'scrunchie',
      'headband',
      'wallet',
      'cardholder',
      'keychain',
      'umbrella',
      'cufflinks',
      'accessory',
      'accessories',
      'accessori',
      'cappello',
      'berretto',
      'sciarpa',
      'foulard',
      'cintura',
      'guanti',
      'calze',
      'calzini',
      'occhiali',
      'orologio',
      'gioielli',
      'collana',
      'bracciale',
      'orecchini',
      'anello',
      'cravatta',
      'portafoglio',
      'accessoire',
      'accessoires',
      'chapeau',
      'casquette',
      'bonnet',
      'écharpe',
      'ceinture',
      'gants',
      'chaussettes',
      'collants',
      'lunettes',
      'montre',
      'bijoux',
      'collier',
      'boucles',
      'bague',
      'portefeuille',
      'hut',
      'mütze',
      'schal',
      'gürtel',
      'handschuhe',
      'socken',
      'strumpfhose',
      'sonnenbrille',
      'brille',
      'uhr',
      'schmuck',
      'kette',
      'armband',
      'ohrringe',
      'krawatte',
      'geldbörse',
      'sombrero',
      'gorra',
      'gorro',
      'boina',
      'bufanda',
      'pañuelo',
      'cinturón',
      'guantes',
      'calcetines',
      'medias',
      'gafas',
      'reloj',
      'joyas',
      'pulsera',
      'pendientes',
      'anillo',
      'corbata',
      'cartera',
      'аксессуары',
      'шапка',
      'кепка',
      'шарф',
      'ремень',
      'пояс',
      'перчатки',
      'носки',
      'колготки',
      'очки',
      'часы',
      'украшения',
      'браслет',
      'серьги',
      'кольцо',
      'галстук',
      'кошелёк',
    ],
  ],
  [
    GarmentCategory.OUTERWEAR,
    [
      'jacket',
      'coat',
      'parka',
      'puffer',
      'down jacket',
      'trench',
      'overcoat',
      'raincoat',
      'anorak',
      'windbreaker',
      'bomber',
      'peacoat',
      'shacket',
      'cape',
      'poncho',
      'blazer',
      'giacca',
      'giubbotto',
      'cappotto',
      'piumino',
      'impermeabile',
      'capispalla',
      'mantella',
      'veste',
      'manteau',
      'doudoune',
      'blouson',
      'imperméable',
      'coupe-vent',
      'ciré',
      'jacke',
      'mantel',
      'daunenjacke',
      'trenchcoat',
      'regenjacke',
      'oberbekleidung',
      'steppjacke',
      'chaqueta',
      'abrigo',
      'cazadora',
      'plumífero',
      'gabardina',
      'americana',
      'cortavientos',
      'anorak',
      'куртка',
      'пальто',
      'пуховик',
      'парка',
      'тренч',
      'плащ',
      'ветровка',
      'бомбер',
      'пиджак',
      'блейзер',
      'шуба',
    ],
  ],
  [
    GarmentCategory.DRESSES,
    [
      'dress',
      'gown',
      'sundress',
      'maxi dress',
      'midi dress',
      'slip dress',
      'shirt dress',
      'kaftan',
      'vestito',
      'abito',
      'vestitino',
      'robe',
      'kleid',
      'abendkleid',
      'sommerkleid',
      'vestido',
      'платье',
      'сарафан',
    ],
  ],
  [
    GarmentCategory.BOTTOMS,
    [
      'pants',
      'trousers',
      'jeans',
      'shorts',
      'skirt',
      'leggings',
      'joggers',
      'sweatpants',
      'chinos',
      'culottes',
      'cargo',
      'slacks',
      'bermuda',
      'palazzo',
      'wide-leg',
      'pantalone',
      'pantaloni',
      'gonna',
      'pantaloncini',
      'minigonna',
      'pantalon',
      'jupe',
      'short',
      'legging',
      'jogging',
      'jupe-culotte',
      'hose',
      'hosen',
      'rock',
      'jogginghose',
      'minirock',
      'unterteile',
      'pantalón',
      'pantalones',
      'vaqueros',
      'falda',
      'mallas',
      'bermudas',
      'minifalda',
      'брюки',
      'штаны',
      'джинсы',
      'юбка',
      'шорты',
      'леггинсы',
      'лосины',
      'джоггеры',
      'чиносы',
    ],
  ],
  [
    GarmentCategory.TOPS,
    [
      'top',
      'tops',
      't-shirt',
      'tee',
      'shirt',
      'blouse',
      'sweater',
      'jumper',
      'pullover',
      'hoodie',
      'sweatshirt',
      'cardigan',
      'knit',
      'knitwear',
      'polo',
      'tank',
      'camisole',
      'cami',
      'crop top',
      'bodysuit',
      'turtleneck',
      'henley',
      'tunic',
      'crewneck',
      'longsleeve',
      'maglia',
      'maglietta',
      'camicia',
      'camicetta',
      'felpa',
      'maglione',
      'canotta',
      'canottiera',
      'dolcevita',
      'lupetto',
      'haut',
      'chemise',
      'chemisier',
      'blouse',
      'pull',
      'sweat',
      'débardeur',
      'tunique',
      'col roulé',
      'oberteil',
      'oberteile',
      'hemd',
      'bluse',
      'pulli',
      'kapuzenpullover',
      'strickjacke',
      'tanktop',
      'rollkragen',
      'strickpullover',
      'camiseta',
      'camisa',
      'blusa',
      'jersey',
      'suéter',
      'sudadera',
      'cárdigan',
      'tirantes',
      'cuello alto',
      'футболка',
      'рубашка',
      'блузка',
      'свитер',
      'джемпер',
      'пуловер',
      'кофта',
      'худи',
      'свитшот',
      'кардиган',
      'толстовка',
      'майка',
      'водолазка',
      'лонгслив',
    ],
  ],
];

/**
 * Phrases that would otherwise be filed by the wrong word. Checked first, and
 * the mapped category wins outright.
 */
const EXCEPTIONS: [string, GarmentCategory][] = [
  ['dress shirt', GarmentCategory.TOPS],
  ['dress shirts', GarmentCategory.TOPS],
  ['dress shoe', GarmentCategory.FOOTWEAR],
  ['dress shoes', GarmentCategory.FOOTWEAR],
  ['dress boot', GarmentCategory.FOOTWEAR],
  ['dress pants', GarmentCategory.BOTTOMS],
  ['dress trousers', GarmentCategory.BOTTOMS],
  ['shirt dress', GarmentCategory.DRESSES],
  ['top handle', GarmentCategory.BAGS],
  ['denim jacket', GarmentCategory.OUTERWEAR],
  ['jean jacket', GarmentCategory.OUTERWEAR],
  ['tank dress', GarmentCategory.DRESSES],
  ['skirt suit', GarmentCategory.OTHER],
];

/** Words that describe who a garment is for, never what it is. */
const GENDER_WORDS = [
  'women',
  "women's",
  'womens',
  'woman',
  'men',
  "men's",
  'mens',
  'man',
  'unisex',
  'kids',
  'boys',
  'girls',
  'damen',
  'herren',
  'femme',
  'homme',
  'donna',
  'uomo',
  'mujer',
  'hombre',
  'женский',
  'мужской',
  'детский',
];

/**
 * Phrases in which an accessory word describes a detail of some other garment.
 * Removed before matching, or "Cap Sleeve Midi Dress" is filed as a hat.
 */
const MODIFIER_PHRASES = [
  'tie-dye',
  'tie dye',
  'tie front',
  'tie waist',
  'tie neck',
  'tie back',
  'tie detail',
  'cap sleeve',
  'cap toe',
  'ring detail',
  'o-ring',
  'with belt',
  'belted',
  'belt detail',
  'belt loop',
  'belt loops',
  'scarf print',
  'sock boot',
  'pocket detail',
];

/** In another language these name a garment; in English they usually do not. */
const AMBIGUOUS = new Set(['short', 'rock', 'veste', 'cape']);

/** Names a shoe only when nothing else in the text names a garment. */
const WEAK: [GarmentCategory, string[]][] = [
  [GarmentCategory.FOOTWEAR, ['oxford', 'boot', 'derby', 'mule', 'slide']],
];

/** German glues the audience on: "Damenmantel" is a coat, "Herrenschuhe" are shoes. */
const GERMAN_PREFIX =
  /(?<![\p{L}\p{N}])(?:damen|herren|kinder|madchen|jungen|baby)/gu;

const GENDER_PATTERN = wordsPattern(GENDER_WORDS);
const MODIFIER_PATTERN = wordsPattern(MODIFIER_PHRASES);

/** Wardrobes name categories in the plural ("Coats"); shops name them singular. */
const stems = (word: string): string[] => {
  const out = new Set<string>([word]);
  if (/[^aeiou]ies$/u.test(word)) {
    out.add(word.replace(/ies$/u, 'y'));
    out.add(word.replace(/ies$/u, 'ie'));
  }
  if (/ves$/u.test(word)) {
    out.add(word.replace(/ves$/u, 'f'));
    out.add(word.replace(/ves$/u, 'fe'));
  }
  if (/(?:ch|sh|s|x|z)es$/u.test(word)) out.add(word.replace(/es$/u, ''));
  if (/[^s]s$/u.test(word)) out.add(word.slice(0, -1));
  if (/s$/u.test(word)) out.add(word.slice(0, -1));
  return [...out];
};

const nameForms = (category: string): string[] => {
  const words = fold(category).split(/\s+/);
  const last = words[words.length - 1];
  return stems(last).map((stem) =>
    [...words.slice(0, -1), stem].join(' ').trim(),
  );
};

const scan = (
  haystack: string,
  table: [GarmentCategory, string[]][],
  allow: (word: string) => boolean,
): GarmentCategory | undefined => {
  for (const [category, words] of table) {
    if (
      words.some((word) => allow(word) && containsWord(haystack, fold(word)))
    ) {
      return category;
    }
  }
  return undefined;
};

/**
 * Maps page text onto a category the user already has, or one of the built-in
 * suggestions. Returns undefined rather than guessing "other": the field is
 * required, so an empty one makes the user choose instead of silently
 * mis-filing the garment.
 */
export function mapCategory(
  text: string,
  knownCategories: string[] = [],
): string | undefined {
  if (!text) return undefined;
  // Every keyword scans the whole string, so the string is what stays bounded.
  const haystack = fold(text.slice(0, 2000))
    .replace(GERMAN_PREFIX, '')
    .replace(GENDER_PATTERN, ' ')
    .replace(MODIFIER_PATTERN, ' ');

  // An exception phrase wins outright, and the words inside it are spoken for:
  // a wardrobe with a "Dresses" category must not claim "dress shirt".
  const matched = EXCEPTIONS.filter(([phrase]) =>
    containsWord(haystack, fold(phrase)),
  );
  let masked = haystack;
  for (const [phrase] of matched) {
    masked = masked.split(fold(phrase)).join(' ');
  }

  const known = knownCategories
    .filter((c) => c && fold(c).length > 2)
    .sort((a, b) => b.length - a.length)
    .find((c) => nameForms(c).some((form) => containsWord(masked, form)));
  if (known) return known;
  if (matched.length) return matched[0][1];

  return (
    scan(haystack, KEYWORDS, (word) => !AMBIGUOUS.has(word)) ??
    scan(haystack, KEYWORDS, (word) => AMBIGUOUS.has(word)) ??
    scan(haystack, WEAK, () => true)
  );
}
