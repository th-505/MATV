"""Validate the verified APK signer against the approved persistent public certificate."""
from pathlib import Path
import re
import sys

def verify(text, expected):
    fingerprints=re.findall(r'^Signer #\d+ certificate SHA-256 digest:\s*([a-fA-F0-9]{64})\s*$',text,re.M)
    expected=expected.strip().lower()
    if not re.fullmatch('[a-f0-9]{64}',expected) or not fingerprints or {s.lower() for s in fingerprints}!={expected}:
        raise ValueError('ANDROID_SIGNING_IDENTITY_CHANGED: release blocked to protect installed-user upgrades')

if __name__=='__main__':
    verify(Path(sys.argv[1]).read_text(),Path('scripts/android-release-certificate.sha256').read_text())
    print('APK signature verified against the persistent Najd release identity.')
