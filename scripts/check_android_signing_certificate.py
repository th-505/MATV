"""Validate the verified APK signer against the approved persistent public certificate."""
from pathlib import Path
import re
import sys

def verify(text, expected):
    fingerprints=re.findall(r'^(?:V[1-4](?:\.\d+)? )?Signer(?: #\d+| \([^\r\n)]{1,160}\)|:)? certificate SHA-256 digest:\s*([a-fA-F0-9]{64})\s*$',text,re.M)
    expected=expected.strip().lower()
    if not fingerprints:
        labels=[line.split(':',1)[0][:200] for line in text.splitlines() if 'certificate SHA-256 digest:' in line][:8]
        raise ValueError('ANDROID_SIGNER_RECORD_MISSING: public signer labels='+repr(labels))
    if not re.fullmatch('[a-f0-9]{64}',expected) or {s.lower() for s in fingerprints}!={expected}:
        raise ValueError('ANDROID_SIGNING_IDENTITY_CHANGED: expected='+expected+' observed='+','.join(sorted({s.lower() for s in fingerprints})))

if __name__=='__main__':
    verify(Path(sys.argv[1]).read_text(),Path('scripts/android-release-certificate.sha256').read_text())
    print('APK signature verified against the persistent Najd release identity.')
