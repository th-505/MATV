"""Restore unchanged authorized native-build inputs from the approved 2.0.3 package.
No font bytes, private download URLs, or extracted archives enter source control.
The original user bundle remains the preferred workflow input when supplied.
"""
import hashlib
import io
from pathlib import Path
import urllib.request
import zipfile

URL = 'https://github.com/th-505/NajdTV/releases/download/v2.0.3/Najd-TV-Android-Mobile-ARM64.apk'
PACKAGE_SHA256 = '952884b818d22d8b915cf2c31bf4f5d65347972e9b80f7b7d629bef61e53d4e6'
FILES = {
    'thmanyahsans-Bold.otf': '72cc27021cc1a503e5c03b072df8b16d55c78983e5fd73a4cdf92b5a600af2f7',
    'thmanyahsans-Medium.otf': 'f2762ffbe17351193e3d630dd10f0c3a965e6c873998dfdeda2bd0dcad7985c6',
    'thmanyahsans-Regular.otf': 'f45a420632384b42a37ec9b24298ddc6502faa52d55d973144779262ebc023dc',
    'LICENSE.pdf': '07bbb2321bd2b944333c25f4d55140ca22625666132394d7399a365bd8b79a10',
}

def verified_inputs(payload):
    if hashlib.sha256(payload).hexdigest() != PACKAGE_SHA256:
        raise ValueError('APPROVED_NATIVE_PACKAGE_CHECKSUM_MISMATCH')
    result = {}
    with zipfile.ZipFile(io.BytesIO(payload)) as archive:
        for name, expected in FILES.items():
            member = 'assets/flutter_assets/assets/najd/fonts/' + name
            info = archive.getinfo(member)
            if info.file_size > 8 * 1024 * 1024:
                raise ValueError('NATIVE_FONT_INPUT_TOO_LARGE')
            data = archive.read(info)
            if hashlib.sha256(data).hexdigest() != expected:
                raise ValueError('NATIVE_FONT_CHECKSUM_MISMATCH')
            result[name] = data
    return result

if __name__ == '__main__':
    with urllib.request.urlopen(URL, timeout=90) as response:
        payload = response.read(48 * 1024 * 1024 + 1)
    result = verified_inputs(payload)
    destination = Path(__file__).resolve().parents[1] / 'flutter_app/assets/najd/fonts'
    destination.mkdir(parents=True, exist_ok=True)
    for name, data in result.items():
        (destination / name).write_bytes(data)
    print('Verified original native typography and license restored into ignored build inputs.')
