import os, struct, zlib, math

def make_png(size):
    pixels = bytearray()
    cx = (size - 1) / 2.0
    cy = (size - 1) / 2.0
    r_orb = size * 0.40
    corner = size * 0.22

    for y in range(size):
        pixels.append(0)
        for x in range(size):
            dx_c = max(corner - x, 0.0, x - (size - 1 - corner))
            dy_c = max(corner - y, 0.0, y - (size - 1 - corner))
            if math.hypot(dx_c, dy_c) > corner:
                pixels += bytes([0, 0, 0, 0])
                continue
            dx = x - cx
            dy = y - cy
            dist = math.hypot(dx, dy)
            bg_t = min(1.0, dist / (size * 0.65))
            bgR = int(20 + 6 * bg_t)
            bgG = int(8 + 4 * bg_t)
            bgB = int(38 + 12 * bg_t)
            if dist > r_orb + size * 0.07:
                pixels += bytes([bgR, bgG, bgB, 255])
                continue
            glow_w = size * 0.07
            glow_d = dist - r_orb
            if 0 < glow_d < glow_w:
                ga = int(100 * (1 - glow_d / glow_w) ** 2)
                gR = int(bgR + (124 - bgR) * ga / 255)
                gG = int(bgG + (58  - bgG) * ga / 255)
                gB = int(bgB + (237 - bgB) * ga / 255)
                pixels += bytes([gR, gG, gB, 255])
                continue
            if dist <= r_orb:
                t = dist / r_orb
                if t < 0.5:
                    f = t / 0.5
                    oR = int(168 + (124 - 168) * f)
                    oG = int(85  + (58  - 85)  * f)
                    oB = int(247 + (237 - 247) * f)
                else:
                    f = (t - 0.5) / 0.5
                    oR = int(124 + (79  - 124) * f)
                    oG = int(58  + (23  - 58)  * f)
                    oB = int(237 + (153 - 237) * f)
                hl_dist = math.hypot(dx - (-r_orb * 0.18), dy - (-r_orb * 0.22))
                hl = max(0.0, 1.0 - hl_dist / (r_orb * 0.48)) ** 2 * 0.30
                oR = min(255, int(oR + (255 - oR) * hl))
                oG = min(255, int(oG + (255 - oG) * hl))
                oB = min(255, int(oB + (255 - oB) * hl))
                pixels += bytes([oR, oG, oB, 255])
            else:
                pixels += bytes([bgR, bgG, bgB, 255])

    rows = []
    i = 0
    for y in range(size):
        i += 1
        row = []
        for x in range(size):
            row.append([pixels[i], pixels[i+1], pixels[i+2], pixels[i+3]])
            i += 4
        rows.append(row)

    stroke = max(1.5, size * 0.038)
    font_r = size * 0.265
    gx = cx - size * 0.02
    gy = cy + size * 0.01
    open_start = math.radians(-52)
    open_end   = math.radians(52)

    for py in range(size):
        for px in range(size):
            dx = px - gx
            dy = py - gy
            d = math.hypot(dx, dy)
            arc_dist = abs(d - font_r)
            if arc_dist < stroke + 1:
                angle = math.atan2(dy, dx)
                in_gap = open_start < angle < open_end
                if not in_gap:
                    alpha = max(0.0, min(1.0, 1.0 - arc_dist / stroke))
                    a8 = int(alpha * 230)
                    if a8 > 0 and rows[py][px][3] > 0:
                        eb = 1.0 - alpha
                        rows[py][px][0] = min(255, int(rows[py][px][0] * eb + 255 * alpha))
                        rows[py][px][1] = min(255, int(rows[py][px][1] * eb + 255 * alpha))
                        rows[py][px][2] = min(255, int(rows[py][px][2] * eb + 255 * alpha))
            bar_y = gy
            bar_x_start = gx + font_r * math.cos(open_end) - stroke * 0.5
            bar_x_end   = gx + font_r + stroke * 0.3
            bar_dist = abs(py - bar_y)
            if bar_dist < stroke and bar_x_start <= px <= bar_x_end:
                alpha = max(0.0, 1.0 - bar_dist / stroke)
                if rows[py][px][3] > 0:
                    eb = 1.0 - alpha
                    rows[py][px][0] = min(255, int(rows[py][px][0] * eb + 255 * alpha))
                    rows[py][px][1] = min(255, int(rows[py][px][1] * eb + 255 * alpha))
                    rows[py][px][2] = min(255, int(rows[py][px][2] * eb + 255 * alpha))
            vert_x = gx + font_r - stroke * 0.5
            vert_y_start = gy
            vert_y_end   = gy + font_r * math.sin(open_end)
            vx_dist = abs(px - vert_x)
            if vx_dist < stroke and vert_y_start <= py <= vert_y_end:
                alpha = max(0.0, 1.0 - vx_dist / stroke)
                if rows[py][px][3] > 0:
                    eb = 1.0 - alpha
                    rows[py][px][0] = min(255, int(rows[py][px][0] * eb + 255 * alpha))
                    rows[py][px][1] = min(255, int(rows[py][px][1] * eb + 255 * alpha))
                    rows[py][px][2] = min(255, int(rows[py][px][2] * eb + 255 * alpha))

    def chunk(tag, data):
        c = tag + data
        return struct.pack('>I', len(data)) + c + struct.pack('>I', zlib.crc32(c) & 0xffffffff)

    ihdr = chunk(b'IHDR', struct.pack('>II', size, size) + bytes([8, 6, 0, 0, 0]))
    raw = b''
    for row in rows:
        raw += b'\x00'
        for px in row:
            raw += bytes(px)
    idat = chunk(b'IDAT', zlib.compress(raw, 6))
    iend = chunk(b'IEND', b'')
    return b'\x89PNG\r\n\x1a\n' + ihdr + idat + iend

out_dir = os.path.dirname(os.path.abspath(__file__))
for s in [72, 96, 128, 144, 152, 192, 384, 512]:
    data = make_png(s)
    p = os.path.join(out_dir, f'icon-{s}.png')
    with open(p, 'wb') as f:
        f.write(data)
    print(f'icon-{s}.png  {len(data):,} bytes')
print('Done.')