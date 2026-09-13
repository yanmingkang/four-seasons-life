"""Remove only edge-connected checker backgrounds; retain the source artwork.

Local image processing explicitly authorized by the project owner. This does
not generate artwork or convert an image into a 3D model. The runtime buildings
are separate, volumetric models in src/pastoral-buildings.js.
"""
import argparse
from collections import deque
from hashlib import sha256
import json
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw


def cut_cell(rgb):
    height, width, _ = rgb.shape
    # Neutral light pixels connected to the cell edge are the fake checker.
    # Do not globally erase whites: the stadium has a large white roof.
    values = rgb.astype(np.int16)
    candidate = (values.max(2) - values.min(2) <= 18) & (values.min(2) >= 158)
    outside = np.zeros((height, width), dtype=bool)
    queue = deque()
    for x in range(width):
        for y in (0, height - 1):
            if candidate[y, x] and not outside[y, x]:
                outside[y, x] = True
                queue.append((y, x))
    for y in range(height):
        for x in (0, width - 1):
            if candidate[y, x] and not outside[y, x]:
                outside[y, x] = True
                queue.append((y, x))
    while queue:
        y, x = queue.popleft()
        for yy, xx in ((y-1, x), (y+1, x), (y, x-1), (y, x+1)):
            if 0 <= yy < height and 0 <= xx < width and candidate[yy, xx] and not outside[yy, xx]:
                outside[yy, xx] = True
                queue.append((yy, xx))
    alpha = np.where(outside, 0, 255).astype(np.uint8)
    ys, xs = np.nonzero(alpha)
    if not len(xs):
        raise ValueError('Background removal left an empty cell')
    bounds = [int(xs.min()), int(ys.min()), int(xs.max()+1), int(ys.max()+1)]
    coverage = float(np.count_nonzero(alpha) / alpha.size)
    if not .04 < coverage < .88 or bounds[0] == 0 or bounds[1] == 0 or bounds[2] == width or bounds[3] == height:
        raise ValueError(f'Unsafe cutout bounds/coverage: {bounds}, {coverage}')
    rgba = np.dstack((rgb, alpha))
    rgba[outside, :3] = 0
    return rgba, {'bounds': bounds, 'coverage': round(coverage, 4), 'opaque_white_pixels': int(np.count_nonzero((values.min(2) > 220) & ~outside))}


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--root', type=Path, default=Path(__file__).resolve().parents[1])
    args = parser.parse_args()
    source = args.root / 'docs/art-drafts/life-landmarks-opaque-v2.png'
    output = args.root / 'public/art/life-landmarks-v1.png'
    reports = args.root / 'test-results'
    before = sha256(source.read_bytes()).hexdigest()
    original = Image.open(source).convert('RGB')
    width, height = original.size
    if width % 2 or height % 2:
        raise ValueError('Expected a two-by-two atlas')
    atlas = Image.new('RGBA', original.size)
    stats = {}
    for index, name in enumerate(('library', 'stadium', 'village', 'bookstall')):
        x, y = (index % 2) * (width // 2), (index // 2) * (height // 2)
        cell = original.crop((x, y, x+width//2, y+height//2))
        rgba, detail = cut_cell(np.asarray(cell))
        atlas.paste(Image.fromarray(rgba), (x, y))
        stats[name] = detail
    if stats['stadium']['opaque_white_pixels'] < 5000:
        raise ValueError('Stadium roof preservation check failed')
    output.parent.mkdir(parents=True, exist_ok=True)
    reports.mkdir(parents=True, exist_ok=True)
    atlas.save(output, optimize=True)
    previews = Image.new('RGB', (width*2, height+38), '#f5e6c7')
    for index, color in enumerate(('#f5e6c7', '#28382e')):
        backdrop = Image.new('RGBA', atlas.size, color)
        backdrop.alpha_composite(atlas)
        previews.paste(backdrop.convert('RGB'), (index*width, 38))
    ImageDraw.Draw(previews).text((12, 12), 'Original artwork / border-connected removal / cream + dark QA', fill='#28382e')
    previews.save(reports / 'landmark-cutout-check.png')
    assert before == sha256(source.read_bytes()).hexdigest(), 'Source artwork changed'
    report = {'source': str(source.relative_to(args.root)), 'source_sha256': before, 'output': str(output.relative_to(args.root)), 'size': [width, height], 'method': 'edge-connected neutral-checker flood fill; no global white removal', 'cells': stats}
    (reports / 'landmark-cutout-report.json').write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding='utf-8')
    print(json.dumps(report, ensure_ascii=False, indent=2))


if __name__ == '__main__':
    main()
