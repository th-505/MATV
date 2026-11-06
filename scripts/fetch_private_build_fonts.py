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
if not url:
    raise SystemExit('The private font download URL is required for this iPhone build.')
print(f'::add-mask::{url}')
# Exact bundle verified locally; fail closed if the remote file is replaced.
expected = '5b16d16a091cda3b11f8c86de800793ecb75c78943b7e0091003cdff514ede99'
with urllib.request.urlopen(url, timeout=90) as response:
    payload = response.read(32 * 1024 * 1024 + 1)
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
