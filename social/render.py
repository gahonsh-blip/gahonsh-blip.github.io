#!/usr/bin/env python3
"""GAHONSH daily Short renderer - 100% free, no API key, no phone.

Runs inside a free GitHub Action (see .github/workflows/daily-video.yml) at
08:00 IST and produces, every single day:

    social/media/short-YYYY-MM-DD.mp4   15s vertical Short, 1080x1920, H.264
    social/daily.json                   the manifest the Apps Script reads

Why not a "free AI video API": no such thing exists at one-video-per-day
volume. Free tiers end, watermarks appear, or a card is required. Pillow and
ffmpeg are already on the GitHub runner and cost nothing, so the Short is
composed from branded cards plus a free neural voice (edge-tts). It looks
deliberate, it never watermarks, and it cannot run out.

The Short is deliberately evergreen brand content (services + proof + call to
action). The day's festival or topic message is carried by the caption that the
Apps Script posts, so the video never contradicts a festival day.
"""
from __future__ import annotations

import argparse
import json
import shutil
import subprocess
import sys
import tempfile
from datetime import datetime, timedelta, timezone
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

IST = timezone(timedelta(hours=5, minutes=30))
W, H = 1080, 1920

BRAND = "GAHONSH"
SITE = "gahonsh-blip.github.io"
TAGLINE = "Websites . Web apps . APIs . Dashboards"

BG = (247, 245, 240)
TEAL = (18, 119, 106)
AMBER = (201, 146, 46)
NAVY = (30, 58, 76)
INK = (18, 33, 31)

# Evergreen rotating proof lines. One per day, deterministic by date.
PROOF = [
    ("Fixed price. Fixed date.", "Written scope before we start, so the invoice never surprises you."),
    ("You own everything.", "Repo, hosting, database and domain stay in your name at handover."),
    ("Shipped in days, not months.", "A landing page goes live in 3 days. A web app in 2 to 4 weeks."),
    ("Built to survive real use.", "Mobile first, tested on a weak connection before handover."),
    ("One developer, direct answers.", "You talk to the person writing the code, not an account manager."),
    ("Seven days of bug support.", "Anything we broke, we fix free. In writing, every project."),
    ("Dashboards that reconcile.", "Every number traceable to a row you can open."),
    ("Working across time zones.", "Americas, UK, Gulf, Singapore, Australia. Written updates daily."),
]

FONT_CANDIDATES = [
    "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf",
    "/usr/share/fonts/truetype/liberation/LiberationSans-Bold.ttf",
    "C:/Windows/Fonts/arialbd.ttf",
    "/Library/Fonts/Arial Bold.ttf",
]
FONT_REG_CANDIDATES = [
    "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
    "/usr/share/fonts/truetype/liberation/LiberationSans-Regular.ttf",
    "C:/Windows/Fonts/arial.ttf",
]


def font(size: int, bold: bool = True):
    for path in (FONT_CANDIDATES if bold else FONT_REG_CANDIDATES):
        if Path(path).exists():
            return ImageFont.truetype(path, size)
    return ImageFont.load_default()


def wrap(draw, text, fnt, max_w):
    lines, cur = [], ""
    for word in str(text).split():
        trial = (cur + " " + word).strip()
        if draw.textlength(trial, font=fnt) <= max_w:
            cur = trial
        else:
            if cur:
                lines.append(cur)
            cur = word
    if cur:
        lines.append(cur)
    return lines


def draw_lines(draw, lines, fnt, x, y, max_w, fill, spacing=1.25, centre=False):
    step = int(fnt.size * spacing)
    for line in lines:
        if centre:
            w = draw.textlength(line, font=fnt)
            draw.text((x + (max_w - w) / 2, y), line, font=fnt, fill=fill)
        else:
            draw.text((x, y), line, font=fnt, fill=fill)
        y += step
    return y


def base_card(bg=BG):
    img = Image.new("RGB", (W, H), bg)
    d = ImageDraw.Draw(img)
    d.rectangle([0, 0, W, 22], fill=TEAL)
    d.rectangle([0, H - 26, W, H], fill=NAVY)
    return img, d


def card_intro():
    img, d = base_card()
    d.text((80, 130), BRAND, font=font(58), fill=TEAL)
    d.text((80, 215), "SINCE 2021  .  BUNDU, JHARKHAND", font=font(26, False), fill=NAVY)

    lines = wrap(d, "Software that your business can actually run on.", font(84), W - 160)
    draw_lines(d, lines, font(84), 80, 560, W - 160, INK)

    d.rectangle([80, 900, 220, 912], fill=AMBER)
    draw_lines(d, wrap(d, TAGLINE, font(40, False), W - 160), font(40, False), 80, 960, W - 160, NAVY)
    d.text((80, H - 150), SITE, font=font(42), fill=TEAL)
    return img


def card_proof(title, body):
    img, d = base_card()
    d.text((80, 140), BRAND, font=font(42), fill=TEAL)
    d.rectangle([80, 240, 200, 250], fill=AMBER)

    draw_lines(d, wrap(d, title, font(96), W - 160), font(96), 80, 620, W - 160, INK)
    draw_lines(d, wrap(d, body, font(46, False), W - 160), font(46, False), 80, 1000, W - 160, NAVY)

    d.text((80, H - 150), SITE, font=font(42), fill=TEAL)
    return img


def card_cta():
    img = Image.new("RGB", (W, H), NAVY)
    d = ImageDraw.Draw(img)
    for y in range(H):
        t = y / H
        colour = tuple(int(NAVY[i] + (TEAL[i] - NAVY[i]) * (0.15 + 0.75 * t)) for i in range(3))
        d.line([(0, y), (W, y)], fill=colour)
    d.rectangle([0, 0, W, 22], fill=AMBER)

    d.text((80, 300), BRAND, font=font(64), fill=(255, 255, 255))
    lines = wrap(d, "Tell us what you need.\nWe will scope it honestly.".replace("\n", " "), font(76), W - 160)
    y = 620
    for line in lines:
        d.text((80, y), line, font=font(76), fill=(255, 255, 255))
        y += 100

    d.rectangle([80, y + 40, 240, y + 52], fill=AMBER)
    d.text((80, y + 110), SITE, font=font(52), fill=(255, 255, 255))
    d.text((80, H - 220), "Fixed price  .  Fixed date  .  No surprises", font=font(38, False), fill=(235, 240, 238))
    return img


def synth_voice(text: str, out_path: Path) -> bool:
    """Free Microsoft neural voice through edge-tts. Silent video if unavailable."""
    if not shutil.which("edge-tts"):
        return False
    try:
        import asyncio

        import edge_tts

        async def run():
            tts = edge_tts.Communicate(text, "en-IN-PrabhatNeural", rate="+8%")
            await tts.save(str(out_path))

        asyncio.run(run())
        return out_path.exists() and out_path.stat().st_size > 2000
    except Exception as exc:  # noqa: BLE001 - never fail the render for audio
        print(f"voice skipped: {exc}", file=sys.stderr)
        return False


def render(paths, out_path: Path, audio: Path | None, per_card=5.0):
    """Concat the cards into one H.264 mp4. Static cards, tiny file, instant."""
    with tempfile.TemporaryDirectory() as tmp:
        listing = Path(tmp) / "list.txt"
        with listing.open("w", encoding="utf-8") as fh:
            for path in paths:
                fh.write(f"file '{path}'\n")
                fh.write(f"duration {per_card}\n")
            fh.write(f"file '{paths[-1]}'\n")

        cmd = [
            "ffmpeg", "-y", "-loglevel", "error",
            "-f", "concat", "-safe", "0", "-i", str(listing),
        ]
        if audio:
            cmd += ["-i", str(audio)]
        cmd += [
            "-vf", f"scale={W}:{H},format=yuv420p",
            "-r", "30",
            "-c:v", "libx264", "-preset", "veryfast", "-crf", "26",
            "-movflags", "+faststart",
        ]
        if audio:
            cmd += ["-c:a", "aac", "-b:a", "96k", "-shortest"]
        cmd += [str(out_path)]
        subprocess.run(cmd, check=True)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--date", help="YYYY-MM-DD, default today in IST")
    ap.add_argument("--root", default=".", help="repo root")
    ap.add_argument("--seconds-per-card", type=float, default=5.0)
    ap.add_argument("--no-voice", action="store_true")
    args = ap.parse_args()

    root = Path(args.root).resolve()
    day = args.date or datetime.now(IST).date().isoformat()
    media_dir = root / "social" / "media"
    media_dir.mkdir(parents=True, exist_ok=True)

    proof = PROOF[abs(hash(day)) % len(PROOF)]
    cards = [card_intro(), card_proof(*proof), card_cta()]

    with tempfile.TemporaryDirectory() as tmp:
        tmpdir = Path(tmp)
        paths = []
        for i, card in enumerate(cards, start=1):
            p = tmpdir / f"card{i}.png"
            card.save(p, "PNG", optimize=True)
            paths.append(p)

        audio = None
        if not args.no_voice:
            audio = tmpdir / "voice.mp3"
            if not synth_voice(f"{BRAND}. Software your business can run on. {SITE}", audio):
                audio = None

        video = media_dir / f"short-{day}.mp4"
        render(paths, video, audio, per_card=args.seconds_per_card)

    size = video.stat().st_size
    if size < 20000:
        raise SystemExit(f"render produced only {size} bytes, refusing to publish")

    manifest = {
        "date": day,
        "video_url": f"https://gahonsh-blip.github.io/social/media/{video.name}",
        "duration_seconds": round(args.seconds_per_card * len(cards), 1),
        "bytes": size,
        "source": "github-actions/pillow+ffmpeg",
        "updated": datetime.now(IST).isoformat(timespec="seconds"),
        # title/description are filled by the Apps Script from the day's post,
        # so a festival caption never contradicts an evergreen video.
    }
    out = root / "social" / "daily.json"
    out.write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8")

    print(json.dumps({"ok": True, "video": str(video), "bytes": size, "manifest": str(out)}))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
