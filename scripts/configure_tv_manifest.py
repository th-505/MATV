#!/usr/bin/env python3
"""Add TV launcher/features to the generated release manifest, idempotently."""
import sys
from pathlib import Path
import xml.etree.ElementTree as ET

ANDROID = 'http://schemas.android.com/apk/res/android'
ET.register_namespace('android', ANDROID)
name = f'{{{ANDROID}}}name'
required = f'{{{ANDROID}}}required'
path = Path(sys.argv[1]) / 'android/app/src/main/AndroidManifest.xml'
tree = ET.parse(path)
root = tree.getroot()
for feature, value in [('android.software.leanback', 'true'), ('android.hardware.touchscreen', 'false')]:
    node = next((node for node in root.findall('uses-feature') if node.get(name) == feature), None)
    if node is None:
        node = ET.SubElement(root, 'uses-feature', {name: feature})
    node.set(required, value)
application = root.find('application')
assert application is not None
application.set(f'{{{ANDROID}}}banner', '@drawable/launch_qaf')
launcher = next((node for node in application.findall('.//intent-filter') if any(child.get(name) == 'android.intent.category.LAUNCHER' for child in node.findall('category'))), None)
assert launcher is not None
if not any(node.get(name) == 'android.intent.category.LEANBACK_LAUNCHER' for node in launcher.findall('category')):
    ET.SubElement(launcher, 'category', {name: 'android.intent.category.LEANBACK_LAUNCHER'})
tree.write(path, encoding='unicode', xml_declaration=True)
