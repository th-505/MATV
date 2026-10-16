#!/usr/bin/env python3
"""Generate deterministic MITV native, desktop and web branding after `flutter create`.

The approved MITV identity uses a deep navy surface and slate-blue M/play mark.
No bundled font or third-party image dependency is required.
"""
from __future__ import annotations

import json
import plistlib
import re
import struct
import sys
import zlib
from pathlib import Path

BACKGROUND = (11, 18, 32, 255)
ACCENT = (112, 141, 184, 255)
FOREGROUND = (255, 255, 255, 255)
TRANSPARENT = (0, 0, 0, 0)


def png_bytes(width: int, height: int, rgba: bytearray) -> bytes:
    raw = b"".join(b"\x00" + bytes(rgba[y * width * 4:(y + 1) * width * 4]) for y in range(height))
    def chunk(kind: bytes, data: bytes) -> bytes:
        return struct.pack(">I", len(data)) + kind + data + struct.pack(">I", zlib.crc32(kind + data) & 0xFFFFFFFF)
    return b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", struct.pack(">IIBBBBB", width, height, 8, 6, 0, 0, 0)) + chunk(b"IDAT", zlib.compress(raw, 9)) + chunk(b"IEND", b"")


def mark(size: int, background: tuple[int, int, int, int]) -> bytes:
    w = h = max(16, int(size))
    px = bytearray(background * (w * h))

    def put(x: int, y: int, color=ACCENT):
        if 0 <= x < w and 0 <= y < h:
            i = (y * w + x) * 4
            px[i:i + 4] = bytes(color)

    def disk(cx: float, cy: float, radius: float, color=ACCENT):
        x0, x1 = max(0, int(cx - radius)), min(w - 1, int(cx + radius))
        y0, y1 = max(0, int(cy - radius)), min(h - 1, int(cy + radius))
        r2 = radius * radius
        for y in range(y0, y1 + 1):
            dy = y - cy
            for x in range(x0, x1 + 1):
                dx = x - cx
                if dx * dx + dy * dy <= r2:
                    put(x, y, color)

    def ring(cx: float, cy: float, outer: float, inner: float):
        x0, x1 = max(0, int(cx - outer)), min(w - 1, int(cx + outer))
        y0, y1 = max(0, int(cy - outer)), min(h - 1, int(cy + outer))
        o2, i2 = outer * outer, inner * inner
        for y in range(y0, y1 + 1):
            dy = y - cy
            for x in range(x0, x1 + 1):
                dx = x - cx
                d2 = dx * dx + dy * dy
                if i2 <= d2 <= o2:
                    put(x, y, FOREGROUND if x + y < (cx + cy) * .91 else ACCENT)

    def thick_line(x0: float, y0: float, x1: float, y1: float, radius: float):
        steps = max(2, int(max(abs(x1 - x0), abs(y1 - y0))))
        for n in range(steps + 1):
            t = n / steps
            disk(x0 + (x1 - x0) * t, y0 + (y1 - y0) * t, radius)

    def triangle(a, b, c, color=FOREGROUND):
        min_x = max(0, int(min(a[0], b[0], c[0])))
        max_x = min(w - 1, int(max(a[0], b[0], c[0])))
        min_y = max(0, int(min(a[1], b[1], c[1])))
        max_y = min(h - 1, int(max(a[1], b[1], c[1])))
        def sign(p1, p2, p3):
            return (p1[0] - p3[0]) * (p2[1] - p3[1]) - (p2[0] - p3[0]) * (p1[1] - p3[1])
        for y in range(min_y, max_y + 1):
            for x in range(min_x, max_x + 1):
                p = (x + .5, y + .5)
                d1, d2, d3 = sign(p, a, b), sign(p, b, c), sign(p, c, a)
                if not ((d1 < 0 or d2 < 0 or d3 < 0) and (d1 > 0 or d2 > 0 or d3 > 0)):
                    put(x, y, color)

    points=[(.20,.78),(.20,.22),(.50,.50),(.80,.22),(.80,.78)]
    for a,b in zip(points,points[1:]):
        thick_line(w*a[0],h*a[1],w*b[0],h*b[1],w*.048)
    triangle((w*.43,h*.55),(w*.43,h*.76),(w*.63,h*.655))
    return png_bytes(w, h, px)


def write_icon(path: Path, size: int, transparent: bool = False):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_bytes(mark(size, TRANSPARENT if transparent else BACKGROUND))


def apply_android(root: Path):
    android = root / "android"
    if not android.exists():
        return
    sizes = {
        "mipmap-mdpi": 48,
        "mipmap-hdpi": 72,
        "mipmap-xhdpi": 96,
        "mipmap-xxhdpi": 144,
        "mipmap-xxxhdpi": 192,
    }
    res = android / "app/src/main/res"
    for folder, size in sizes.items():
        write_icon(res / folder / "ic_launcher.png", size)
    write_icon(res / "drawable" / "launch_mitv.png", 256, transparent=True)

    # Android's layer-list item `android:drawable` requires a drawable resource
    # reference. Keep the splash background in a named color resource rather than
    # embedding a raw #RRGGBB value, which fails aapt2 resource linking on API 21+.
    values = res / "values"
    values.mkdir(parents=True, exist_ok=True)
    (values / "colors.xml").write_text(
        """<?xml version=\"1.0\" encoding=\"utf-8\"?>\n<resources>\n    <color name=\"mitv_splash_bg\">#0B1220</color>\n</resources>\n""",
        encoding="utf-8",
    )
    launch_xml = """<?xml version=\"1.0\" encoding=\"utf-8\"?>
<layer-list xmlns:android=\"http://schemas.android.com/apk/res/android\">
    <item android:drawable=\"@color/mitv_splash_bg\" />
    <item><bitmap android:gravity=\"center\" android:src=\"@drawable/launch_mitv\" /></item>
</layer-list>
"""
    for folder in ("drawable", "drawable-v21"):
        target = res / folder / "launch_background.xml"
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_text(launch_xml, encoding="utf-8")
    manifest = android / "app/src/main/AndroidManifest.xml"
    if manifest.exists():
        text = manifest.read_text(encoding="utf-8")
        # Flutter's debug/profile manifests grant Internet, but the generated
        # release manifest needs it explicitly for the API and direct HLS.
        permission = r'<uses-permission\b[^>]*android:name=["\']android\.permission\.INTERNET["\']'
        if not re.search(permission, text):
            text = re.sub(r'(<manifest\b[^>]*>)', r'\1\n    <uses-permission android:name="android.permission.INTERNET"/>', text, count=1)
        # Cleartext is limited to the device-local byte bridge; external media remains HTTPS.
        network = res / "xml/network_security_config.xml"
        network.parent.mkdir(parents=True, exist_ok=True)
        network.write_text('''<?xml version="1.0" encoding="utf-8"?>
<network-security-config><base-config cleartextTrafficPermitted="false"/>
<domain-config cleartextTrafficPermitted="true"><domain includeSubdomains="false">127.0.0.1</domain><domain includeSubdomains="false">localhost</domain></domain-config>
</network-security-config>''', encoding="utf-8")
        text = re.sub(r'(<application\b)', r'\1 android:networkSecurityConfig="@xml/network_security_config"', text, count=1) if 'android:networkSecurityConfig' not in text else text
        text = re.sub(r'android:label="[^"]*"', 'android:label="MITV"', text, count=1)
        manifest.write_text(text, encoding="utf-8")


def ios_pixel_size(entry: dict) -> int:
    raw_size = str(entry.get("size", "0x0")).split("x", 1)[0]
    scale = str(entry.get("scale", "1x")).rstrip("x")
    try:
        return max(16, round(float(raw_size) * float(scale)))
    except ValueError:
        return 64


def apply_ios(root: Path):
    ios = root / "ios"
    if not ios.exists():
        return
    assets = ios / "Runner/Assets.xcassets"
    contents = assets / "AppIcon.appiconset/Contents.json"
    if contents.exists():
        data = json.loads(contents.read_text(encoding="utf-8"))
        for image in data.get("images", []):
            filename = image.get("filename")
            if filename:
                write_icon(contents.parent / filename, ios_pixel_size(image))
    launch_contents = assets / "LaunchImage.imageset/Contents.json"
    if launch_contents.exists():
        data = json.loads(launch_contents.read_text(encoding="utf-8"))
        for image in data.get("images", []):
            filename = image.get("filename")
            if filename:
                scale = str(image.get("scale", "1x")).rstrip("x")
                try: factor = max(1, int(float(scale)))
                except ValueError: factor = 1
                write_icon(launch_contents.parent / filename, 192 * factor, transparent=True)
    storyboard = ios / "Runner/Base.lproj/LaunchScreen.storyboard"
    if storyboard.exists():
        text = storyboard.read_text(encoding="utf-8")
        text = text.replace('red="1" green="1" blue="1" alpha="1"', 'red="0.043" green="0.071" blue="0.125" alpha="1"')
        text = text.replace('red="0.035" green="0.035" blue="0.043" alpha="1"', 'red="0.043" green="0.071" blue="0.125" alpha="1"')
        storyboard.write_text(text, encoding="utf-8")
    plist = ios / "Runner/Info.plist"
    if plist.exists():
        with plist.open("rb") as fh:
            data = plistlib.load(fh)
        data.setdefault("NSAppTransportSecurity", {})["NSAllowsLocalNetworking"] = True
        data["CFBundleDisplayName"] = "MITV"
        data["CFBundleName"] = "MITV"
        data["UIFileSharingEnabled"] = True
        data["LSSupportsOpeningDocumentsInPlace"] = True
        with plist.open("wb") as fh:
            plistlib.dump(data, fh, sort_keys=False)


def apply_web(root: Path):
    web=root / "web"
    if not web.exists(): return
    for size in (192,512):
        for name in (f"Icon-{size}.png",f"Icon-maskable-{size}.png"):
            write_icon(web/"icons"/name,size)
    write_icon(web/"favicon.png",64)


def apply_windows(root: Path):
    windows=root/"windows"
    if not windows.exists(): return
    images=[(size,mark(size,BACKGROUND)) for size in (16,32,48,256)]
    header=struct.pack('<HHH',0,1,len(images)); offset=6+16*len(images)
    entries=[]
    for size,data in images:
        entries.append(struct.pack('<BBBBHHII',0 if size==256 else size,0 if size==256 else size,0,0,1,32,len(data),offset));offset+=len(data)
    icon=windows/'runner/resources/app_icon.ico';icon.parent.mkdir(parents=True,exist_ok=True)
    icon.write_bytes(header+b''.join(entries)+b''.join(data for _,data in images))
    main=windows/'runner/main.cpp'
    if main.exists():
        text=main.read_text();text=re.sub(r'window.Create\(L"[^"\n]+"','window.Create(L"MITV"',text);main.write_text(text)
    rc=windows/'runner/Runner.rc'
    if rc.exists():
        text=rc.read_text()
        for key in ('CompanyName','FileDescription','ProductName'):
            text=re.sub(r'(VALUE "'+key+r'", )"[^"\n]*"',r'\1"MITV" "\\0"',text)
        rc.write_text(text)


def apply_macos(root: Path):
    macos = root / "macos"
    if not macos.exists():
        return
    plist = macos / "Runner/Info.plist"
    if plist.exists():
        with plist.open("rb") as fh:
            data = plistlib.load(fh)
        data["CFBundleDisplayName"] = "MITV"
        data["CFBundleName"] = "MITV"
        with plist.open("wb") as fh:
            plistlib.dump(data, fh, sort_keys=False)

    # The app is sandboxed but needs direct HTTPS playback/API access, the
    # device-local Alooy bridge, and user-selected subtitle files.
    entitlements = {
        "com.apple.security.app-sandbox": True,
        "com.apple.security.network.client": True,
        "com.apple.security.network.server": True,
        "com.apple.security.files.user-selected.read-only": True,
    }
    for name in ("DebugProfile.entitlements", "Release.entitlements"):
        path = macos / "Runner" / name
        path.parent.mkdir(parents=True, exist_ok=True)
        with path.open("wb") as fh:
            plistlib.dump(entitlements, fh, sort_keys=False)


def main():
    root = Path(sys.argv[1] if len(sys.argv) > 1 else "flutter_app").resolve()
    apply_android(root)
    apply_ios(root)
    apply_windows(root)
    apply_macos(root)
    apply_web(root)
    print(f"native branding applied to {root}")


if __name__ == "__main__":
    main()
