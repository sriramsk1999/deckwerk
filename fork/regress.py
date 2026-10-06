#!/usr/bin/env python3
"""Screenshot every slide of every talk, and compare against a baseline.

Render a baseline with the build you trust, update (rebase, rebuild), then
compare: only the slides that changed need a look.

    fork/regress.py baseline [DECK ...]
    fork/regress.py compare  [DECK ...]

DECKs default to every folder holding a deck.json under $DECKWERK_TALKS
(~/src/talks when unset). Renders go to ~/.cache/deckwerk-regress/{baseline,current}.
`compare` writes baseline | current | changes images for each changed slide to
~/.cache/deckwerk-regress/report and exits 1 when anything changed.

Video frames and slides with builds or Morph can differ from run to run (the
capture catches them mid-step): before calling a slide a regression, re-run
`compare`, or take a second baseline with the old build.
"""

import argparse
import hashlib
import json
import os
import shutil
import subprocess
import sys
from pathlib import Path

from PIL import Image, ImageChops

CHECKOUT = Path(__file__).resolve().parent.parent
SLIDE_AGENT = CHECKOUT / "bin" / "slide-agent"
PLAYER_DIR = CHECKOUT / "out" / "export"
CACHE = Path.home() / ".cache" / "deckwerk-regress"
# A pixel counts as changed past this per-channel difference (absorbs antialiasing);
# a slide counts as changed past this fraction of changed pixels.
PIXEL_TOLERANCE = 24
AREA_TOLERANCE = 0.0005


def find_decks(paths: list[str]) -> list[Path]:
    if paths:
        return [Path(p).expanduser().resolve() for p in paths]
    root = Path(os.environ.get("DECKWERK_TALKS", Path.home() / "src" / "talks")).expanduser()
    found = (p.parent for p in root.glob("**/deck.json"))
    return sorted(d for d in found if not {"node_modules", ".git"} & set(d.parts))


def deck_key(deck: Path) -> str:
    try:
        rel = deck.relative_to(Path.home())
    except ValueError:
        rel = deck.relative_to(deck.anchor)
    return str(rel).replace(os.sep, "__")


def player_build() -> str:
    """Identify the player `render` draws with: the built out/export bundle, not the source."""
    digest = hashlib.sha256()
    for name in ("player.js", "player.css"):
        path = PLAYER_DIR / name
        if path.exists():
            digest.update(path.read_bytes())
    return digest.hexdigest()[:12]


def warn_if_stale() -> None:
    player = PLAYER_DIR / "player.js"
    newest = max((p.stat().st_mtime for p in (CHECKOUT / "src").rglob("*") if p.is_file()), default=0)
    if not player.exists() or player.stat().st_mtime < newest:
        print("warning: the player build is older than src/ — renders show the last build. Run fork/rebuild.sh.")


def render(deck: Path, out: Path) -> dict:
    """Render every slide, all builds shown, and record which checkout and build drew them."""
    shutil.rmtree(out, ignore_errors=True)
    out.mkdir(parents=True)
    run = subprocess.run(
        [str(SLIDE_AGENT), "render", str(deck), "--all", "--built", "--output", str(out)],
        capture_output=True, text=True,
    )
    try:
        result = json.loads(run.stdout)
    except json.JSONDecodeError:
        sys.exit(f"render failed for {deck}:\n{run.stderr[-2000:]}")
    (out / "capture-job.json").unlink(missing_ok=True)
    meta = {
        "deck": str(deck),
        "commit": subprocess.run(["git", "-C", str(CHECKOUT), "rev-parse", "--short", "HEAD"],
                                 capture_output=True, text=True).stdout.strip(),
        "player": player_build(),
        "slides": [{"id": s["slideId"], "number": s["number"], "file": Path(s["path"]).name}
                   for s in result["images"]],
    }
    (out / "meta.json").write_text(json.dumps(meta, indent=2))
    return meta


def changed_fraction(a: Image.Image, b: Image.Image) -> tuple[float, Image.Image | None]:
    if a.size != b.size:
        return 1.0, None
    threshold = [0] * (PIXEL_TOLERANCE + 1) + [255] * (255 - PIXEL_TOLERANCE)
    mask = ImageChops.difference(a, b).convert("L").point(threshold)
    return mask.histogram()[255] / (a.width * a.height), mask


def side_by_side(before: Image.Image, after: Image.Image, mask: Image.Image | None) -> Image.Image:
    w, h = after.size
    sheet = Image.new("RGB", (w * 3, h), "white")
    sheet.paste(before.resize((w, h)), (0, 0))
    sheet.paste(after, (w, 0))
    marked = after.copy()
    if mask is not None:
        marked.paste(Image.new("RGB", (w, h), (230, 40, 40)), (0, 0), mask)
    sheet.paste(marked, (2 * w, 0))
    return sheet.resize((w * 3 // 2, h // 2))


def baseline(decks: list[Path]) -> int:
    for deck in decks:
        meta = render(deck, CACHE / "baseline" / deck_key(deck))
        print(f"baseline  {deck}  {len(meta['slides'])} slides @ {meta['commit']}")
    return 0


def compare(decks: list[Path]) -> int:
    shutil.rmtree(CACHE / "report", ignore_errors=True)
    any_changed = False
    for deck in decks:
        key = deck_key(deck)
        base_dir = CACHE / "baseline" / key
        if not (base_dir / "meta.json").exists():
            print(f"no baseline for {deck}: run `baseline` first")
            any_changed = True
            continue
        before = json.loads((base_dir / "meta.json").read_text())
        cur_dir = CACHE / "current" / key
        after = render(deck, cur_dir)
        print(f"{deck}  ({before['commit']} -> {after['commit']}, "
              f"player {before.get('player', '?')} -> {after['player']})")
        if before["commit"] != after["commit"] and before.get("player") == after["player"]:
            print("  warning: new commit but the same player build — did you rebuild?")
        old = {s["id"]: s for s in before["slides"]}
        new = {s["id"]: s for s in after["slides"]}
        report = CACHE / "report" / key
        for sid, s in new.items():
            if sid not in old:
                print(f"  new      slide {s['number']} ({sid})")
                continue
            a = Image.open(base_dir / old[sid]["file"]).convert("RGB")
            b = Image.open(cur_dir / s["file"]).convert("RGB")
            frac, mask = changed_fraction(a, b)
            if frac > AREA_TOLERANCE:
                any_changed = True
                report.mkdir(parents=True, exist_ok=True)
                path = report / f"slide-{s['number']:02d}-{sid}.png"
                side_by_side(a, b, mask).save(path)
                print(f"  CHANGED  slide {s['number']} ({sid}): {frac:.2%} of pixels  -> {path}")
        for sid in old.keys() - new.keys():
            print(f"  removed  slide {old[sid]['number']} ({sid})")
        if not any(sid in old and (report / f"slide-{s['number']:02d}-{sid}.png").exists()
                   for sid, s in new.items()):
            print("  all existing slides unchanged")
    return 1 if any_changed else 0


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("mode", choices=["baseline", "compare"])
    parser.add_argument("decks", nargs="*", help="deck folders (default: every deck under $DECKWERK_TALKS or ~/src/talks)")
    args = parser.parse_args()
    decks = find_decks(args.decks)
    if not decks:
        sys.exit("no decks found")
    warn_if_stale()
    sys.exit(baseline(decks) if args.mode == "baseline" else compare(decks))


if __name__ == "__main__":
    main()
