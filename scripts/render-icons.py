#!/usr/bin/env python3
"""Draw the app icons. No third-party libraries."""

import struct
import zlib
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "icons"


def pixel(x, y, size):
    nx = (x + 0.5) / size
    ny = (y + 0.5) / size
    dx = nx - 0.5
    dy = ny - 0.5
    dist = (dx * dx + dy * dy) ** 0.5
    gold = (224, 179, 106)
    ink = (18, 20, 26)
    if 0.30 <= dist <= 0.345:
        return gold
    dot = ((nx - 0.5) ** 2 + (ny - 0.345) ** 2) ** 0.5
    if dot <= 0.042:
        return gold
    if abs(nx - 0.5) <= 0.044 and 0.41 <= ny <= 0.70:
        return gold
    return ink


def png(size):
    raw = bytearray()
    for y in range(size):
        raw.append(0)
        for x in range(size):
            red, green, blue = pixel(x, y, size)
            raw.extend((red, green, blue))
    compressed = zlib.compress(bytes(raw), 9)

    def chunk(tag, data):
        return struct.pack(">I", len(data)) + tag + data + struct.pack(">I", zlib.crc32(tag + data) & 0xFFFFFFFF)

    ihdr = struct.pack(">IIBBBBB", size, size, 8, 2, 0, 0, 0)
    return b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", ihdr) + chunk(b"IDAT", compressed) + chunk(b"IEND", b"")


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    (OUT / "icon-192.png").write_bytes(png(192))
    (OUT / "icon-512.png").write_bytes(png(512))
    print("Wrote icons/icon-192.png and icons/icon-512.png")


if __name__ == "__main__":
    main()
