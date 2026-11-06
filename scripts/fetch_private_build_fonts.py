"""Prepare the user-provided font in ignored build inputs; never publish originals."""
import hashlib
import io
import os
from pathlib import Path
import subprocess
import sys
import tempfile
import urllib.request
import zipfile

url = os.environ.get('NAJD_FONT_BUNDLE_URL', '')
# The owner uploaded this exact original archive to main; prefer verified checkout inputs.
local = Path(__file__).resolve().parents[1] / 'assets/fonts/Thmanyah-Font-Family.zip'
expected = '5b16d16a091cda3b11f8c86de800793ecb75c78943b7e0091003cdff514ede99'
if local.is_file():
    if local.stat().st_size > 32 * 1024 * 1024:raise SystemExit('Original font bundle too large')
    payload = local.read_bytes()
elif url:
    print(f'::add-mask::{url}')
    with urllib.request.urlopen(url, timeout=90) as response:
        payload = response.read(32 * 1024 * 1024 + 1)
else:
    raise SystemExit('Original font bundle missing from checkout and no private download URL supplied.')
if hashlib.sha256(payload).hexdigest() != expected:
    raise SystemExit('Private font bundle checksum mismatch.')
with tempfile.TemporaryDirectory(prefix='najd-font-') as directory:
    with zipfile.ZipFile(io.BytesIO(payload)) as archive:
        for member in archive.infolist():
            destination = (Path(directory) / member.filename).resolve()
            if not destination.is_relative_to(Path(directory).resolve()):
                raise SystemExit('Unsafe font archive path.')
        archive.extractall(directory)
    subprocess.run([sys.executable, 'scripts/prepare_private_fonts.py', '--source', directory, '--platform', os.environ.get('NAJD_FONT_BUILD_PLATFORM','native')], check=True)
