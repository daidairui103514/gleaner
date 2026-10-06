"""生成扩展图标：琥珀色圆角底板 + 两条对照横线（原文 / 译文）。"""
import os
import struct
import zlib

OUT_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "icons")
SS = 4  # 超采样倍率

PLATE = (0xB8, 0x7A, 0x16)
LINE_A = (0x3A, 0x2A, 0x0C)
LINE_B = (0xFF, 0xF6, 0xE5)


def rounded(x, y, w, h, r):
    cx = min(max(x, r), w - r)
    cy = min(max(y, r), h - r)
    dx = x - cx
    dy = y - cy
    return dx * dx + dy * dy <= r * r


def sample(px, py, size):
    """返回该采样点的 RGBA（0-255 四元组），None 表示透明。"""
    pad = size * 0.055
    x, y = px, py
    w = h = size
    if not rounded(x, y, w, h, size * 0.24):
        return None

    # 局部坐标映射到 [0,1]
    nx = (px - pad) / (size - 2 * pad)
    ny = (py - pad) / (size - 2 * pad)

    def bar(x0, x1, y0, y1):
        if not (x0 <= nx <= x1 and y0 <= ny <= y1):
            return False
        half = (y1 - y0) / 2
        cyy = (y0 + y1) / 2
        if half <= 0:
            return False
        dx = max(x0 - nx, nx - x1, 0)
        dy = abs(ny - cyy) - half
        return (dx * dx + dy * dy) <= (half * 0.55) ** 2 or (x0 <= nx <= x1 and abs(ny - cyy) <= half)

    if bar(0.20, 0.80, 0.29, 0.42):
        return LINE_A
    if bar(0.20, 0.66, 0.58, 0.71):
        return LINE_B
    return PLATE


def render(size):
    px = []
    for y in range(size):
        row = []
        for x in range(size):
            acc = [0, 0, 0, 0]
            for sy in range(SS):
                for sx in range(SS):
                    c = sample(x + (sx + 0.5) / SS, y + (sy + 0.5) / SS, size)
                    if c:
                        acc[0] += c[0]
                        acc[1] += c[1]
                        acc[2] += c[2]
                        acc[3] += 255
            n = SS * SS
            row.append((
                round(acc[0] / n),
                round(acc[1] / n),
                round(acc[2] / n),
                round(acc[3] / n),
            ))
        px.append(row)
    return px


def write_png(path, size, rows):
    raw = b""
    for row in rows:
        raw += b"\x00" + b"".join(struct.pack("BBBB", *p) for p in row)

    def chunk(tag, data):
        return (
            struct.pack(">I", len(data))
            + tag
            + data
            + struct.pack(">I", zlib.crc32(tag + data) & 0xFFFFFFFF)
        )

    png = b"\x89PNG\r\n\x1a\n"
    png += chunk(b"IHDR", struct.pack(">IIBBBBB", size, size, 8, 6, 0, 0, 0))
    png += chunk(b"IDAT", zlib.compress(raw, 9))
    png += chunk(b"IEND", b"")
    with open(path, "wb") as f:
        f.write(png)


def main():
    out = os.path.normpath(OUT_DIR)
    os.makedirs(out, exist_ok=True)
    for size in (16, 32, 48, 128):
        write_png(os.path.join(out, "icon%d.png" % size), size, render(size))
        print("wrote icon%d.png" % size)


if __name__ == "__main__":
    main()
