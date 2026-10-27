"""Generated 3-second test-pattern + sine-wave media; no third-party content.
Reproduce with FFmpeg testsrc2 160x90@10, sine440Hz, libx264/AAC, then HLS copy.
CI decodes this bounded, hash-verified fixture instead of downloading OS codecs.
"""
import base64
import hashlib
import json
from pathlib import Path

root = Path(__file__).resolve().parents[1]
manifest = json.loads((root / 'tests/fixtures/codec-fixtures.json').read_text())
assert set(manifest) == {'sample.mp4', 'master.m3u8', 'master0.ts'}
files = {}
for name, entry in manifest.items():
    content = base64.b64decode(entry['base64'], validate=True)
    assert len(content) == entry['bytes'] and len(content) <= 256 * 1024
    assert hashlib.sha256(content).hexdigest() == entry['sha256']
    files[name] = content
output = Path('/tmp/matv-codec-fixtures')
output.mkdir(parents=True, exist_ok=True)
for name, content in files.items():
    (output / name).write_bytes(content)
print('Verified local MP4/HLS fixtures:', {name: len(data) for name, data in files.items()})
