import tempfile
import unittest
from pathlib import Path
from register_private_font_manifest import register

class ManifestTest(unittest.TestCase):
    def test_weights_and_idempotency(self):
        with tempfile.TemporaryDirectory() as folder:
            root=Path(folder); fonts=root/'assets/najd/fonts'; fonts.mkdir(parents=True)
            for face in ['Regular','Medium','Bold']:
                (fonts/f'thmanyahsans-{face}.otf').touch()
            manifest=root/'pubspec.yaml'; manifest.write_text('flutter:\n  fonts:\n    - family: NajdArabicFallback\n')
            register(root); first=manifest.read_text(); register(root)
            self.assertEqual(first,manifest.read_text())
            self.assertEqual(first.count('family: ThmanyahSans'),1)
            for weight in [400,500,700]: self.assertIn(f'weight: {weight}',first)
    def test_missing_faces_does_not_modify_manifest(self):
        with tempfile.TemporaryDirectory() as folder:
            root=Path(folder); manifest=root/'pubspec.yaml'; manifest.write_text('flutter:\n  fonts:\n')
            with self.assertRaisesRegex(ValueError,'PRIVATE_FONT_FACES_MISSING'): register(root)
            self.assertEqual(manifest.read_text(),'flutter:\n  fonts:\n')

if __name__=='__main__': unittest.main()
