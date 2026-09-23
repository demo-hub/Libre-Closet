# Writes design/og-image.svg and design/social-preview.svg with the text as outlines, so sharp needs no fonts.
# Run: python3 design/outline_text.py <dir with Inter-VF.ttf 4.001 and PlusJakartaSans-VF.ttf 2.071> (fontTools; the brand kit's fetch_fonts.sh downloads them).
import json
import re
import sys
from pathlib import Path

from fontTools.pens.boundsPen import BoundsPen
from fontTools.pens.svgPathPen import SVGPathPen
from fontTools.pens.transformPen import TransformPen
from fontTools.ttLib import TTFont
from fontTools.varLib.instancer import instantiateVariableFont

ROOT = Path(__file__).resolve().parent.parent
TITLE = 'Libre Closet'
TAGLINE = 'Your wardrobe. Your data.'
DESCRIPTION = 'A free, self-hosted wardrobe organiser that keeps your clothes and outfits on your own server.'

colours = {c['id']: c['value']['hex'] for c in json.loads((ROOT / 'src/brand/tokens.json').read_text())['colours']}
mark_paths = re.findall(r'<path d="([^"]+)"', (ROOT / 'design/libre-closet-mark.svg').read_text())


class Face:
    def __init__(self, path, axes, tracking_em=0.0):
        self.font = instantiateVariableFont(TTFont(path), axes)
        self.cmap = self.font.getBestCmap()
        self.glyphs = self.font.getGlyphSet()
        self.upem = self.font['head'].unitsPerEm
        self.tracking = tracking_em * self.upem
        self.kerning = self._kerning()

    def _kerning(self):
        pairs, classes = {}, []
        if 'GPOS' not in self.font:
            return pairs, classes
        gpos = self.font['GPOS'].table
        indices = {i for fr in gpos.FeatureList.FeatureRecord if fr.FeatureTag == 'kern' for i in fr.Feature.LookupListIndex}
        for i in sorted(indices):
            for sub in gpos.LookupList.Lookup[i].SubTable:
                sub = sub.ExtSubTable if sub.LookupType == 9 else sub
                if getattr(sub, 'Format', None) == 1 and hasattr(sub, 'PairSet'):
                    for first, pairset in zip(sub.Coverage.glyphs, sub.PairSet):
                        for rec in pairset.PairValueRecord:
                            v = getattr(rec.Value1, 'XAdvance', 0) if rec.Value1 else 0
                            pairs.setdefault((first, rec.SecondGlyph), v)
                elif getattr(sub, 'Format', None) == 2:
                    classes.append(sub)
        return pairs, classes

    def kern(self, a, b):
        pairs, classes = self.kerning
        if (a, b) in pairs:
            return pairs[(a, b)]
        for sub in classes:
            if a not in sub.Coverage.glyphs:
                continue
            c1 = sub.ClassDef1.classDefs.get(a, 0)
            c2 = sub.ClassDef2.classDefs.get(b, 0)
            rec = sub.Class1Record[c1].Class2Record[c2]
            if rec.Value1 and getattr(rec.Value1, 'XAdvance', 0):
                return rec.Value1.XAdvance
        return 0

    def layout(self, text):
        names = [self.cmap[ord(ch)] for ch in text]
        x, placed = 0, []
        for i, name in enumerate(names):
            placed.append((name, x))
            x += self.font['hmtx'][name][0] + self.tracking
            if i + 1 < len(names):
                x += self.kern(name, names[i + 1])
        return placed, x - self.tracking

    def width(self, text, size):
        return self.layout(text)[1] * size / self.upem

    def path(self, text, size, x, baseline):
        placed, _ = self.layout(text)
        s = size / self.upem
        pen = SVGPathPen(self.glyphs, ntos=lambda v: f'{v:.2f}'.rstrip('0').rstrip('.'))
        for name, gx in placed:
            self.glyphs[name].draw(TransformPen(pen, (s, 0, 0, -s, x + gx * s, baseline)))
        return pen.getCommands()

    def ink(self, text, size):
        placed, _ = self.layout(text)
        s = size / self.upem
        pen = BoundsPen(self.glyphs)
        for name, gx in placed:
            self.glyphs[name].draw(TransformPen(pen, (s, 0, 0, -s, gx * s, 0)))
        return pen.bounds


def mark(x, y, box, stroke):
    d = ''.join(f'<path d="{p}"/>' for p in mark_paths)
    return (f'<g transform="translate({x:.2f} {y:.2f}) scale({box / 24:.4f})" fill="none" stroke="{stroke}" '
            f'stroke-width="2" stroke-linecap="round" stroke-linejoin="round">{d}</g>')


def wrap(face, text, size, width):
    lines, line = [], ''
    for word in text.split():
        trial = f'{line} {word}'.strip()
        if line and face.width(trial, size) > width:
            lines.append(line)
            line = word
        else:
            line = trial
    return lines + [line]


def og_image(title_face, body_face):
    w, h = 1200, 630
    box, gap1, gap2, title_size, tag_size = 160, 40, 24, 56, 28
    mark_ink = (18.5 - 2) * box / 24
    _, t_top, _, t_bottom = title_face.ink(TITLE, title_size)
    _, g_top, _, g_bottom = body_face.ink(TAGLINE, tag_size)
    total = mark_ink + gap1 + (t_bottom - t_top) + gap2 + (g_bottom - g_top)
    top = (h - total) / 2
    mark_y = top - 2 * box / 24
    title_base = top + mark_ink + gap1 - t_top
    tag_base = title_base + t_bottom + gap2 - g_top
    tw, gw = title_face.width(TITLE, title_size), body_face.width(TAGLINE, tag_size)
    return (f'<svg xmlns="http://www.w3.org/2000/svg" width="{w}" height="{h}" viewBox="0 0 {w} {h}">'
            f'<rect width="{w}" height="{h}" fill="{colours["paper"]}"/>'
            f'{mark(w / 2 - 12 * box / 24, mark_y, box, colours["ink"])}'
            f'<path fill="{colours["ink"]}" d="{title_face.path(TITLE, title_size, (w - tw) / 2, title_base)}"/>'
            f'<path fill="{colours["graphite"]}" d="{body_face.path(TAGLINE, tag_size, (w - gw) / 2, tag_base)}"/>'
            '</svg>\n')


def social_preview(title_face, body_face):
    w, h, left = 1280, 640, 100
    lines = wrap(body_face, DESCRIPTION, 44, 1080)
    body = ''.join(f'<path fill="{colours["dark-text-secondary"]}" d="{body_face.path(line, 44, left, 302 + i * 62)}"/>'
                   for i, line in enumerate(lines))
    return (f'<svg xmlns="http://www.w3.org/2000/svg" width="{w}" height="{h}" viewBox="0 0 {w} {h}">'
            f'<rect width="{w}" height="{h}" fill="{colours["ink"]}"/>'
            f'<path fill="{colours["dark-text"]}" d="{title_face.path(TITLE, 88, left, 198)}"/>{body}'
            f'{mark(left - 3 * 4, 452 - 2 * 4, 96, colours["white"])}'
            '</svg>\n')


if __name__ == '__main__':
    fonts = Path(sys.argv[1])
    title_face = Face(fonts / 'PlusJakartaSans-VF.ttf', {'wght': 700}, tracking_em=-0.02)
    body_face = Face(fonts / 'Inter-VF.ttf', {'wght': 400, 'opsz': 14})
    (ROOT / 'design/og-image.svg').write_text(og_image(title_face, body_face))
    (ROOT / 'design/social-preview.svg').write_text(social_preview(title_face, body_face))
