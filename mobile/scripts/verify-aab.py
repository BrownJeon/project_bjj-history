#!/usr/bin/env python3
"""Validate a signed bundle and locally recreate APK delivery; never uploads to Play."""
import argparse
import hashlib
import json
import os
from pathlib import Path
import re
import subprocess
import xml.etree.ElementTree as ET
import zipfile

parser = argparse.ArgumentParser()
parser.add_argument('bundle', type=Path)
parser.add_argument('bundletool', type=Path)
parser.add_argument('--output', type=Path, required=True)
args = parser.parse_args()
root = Path(__file__).resolve().parents[1]
version = json.loads((root / 'version.json').read_text())
sdk = Path(os.environ.get('ANDROID_HOME', str(Path.home() / '.node-local/android-sdk')))
tools = sdk / 'build-tools/36.0.0'
signing = Path(os.environ.get('BJJ_UPLOAD_PROPERTIES', str(Path.home() / '.config/bjj-mobile/upload.properties')))
props = dict(line.split('=', 1) for line in signing.read_text().splitlines() if line and not line.startswith('#'))
out = args.output.resolve()
out.mkdir(parents=True, exist_ok=True)
checks = {}

def run(command, logfile=None, binary=False):
    result = subprocess.run(list(map(str, command)), capture_output=True, text=not binary)
    if logfile:
        (out / logfile).write_text(result.stdout + result.stderr)
    if result.returncode:
        raise RuntimeError(f'{Path(str(command[0])).name} failed ({result.returncode}); see {logfile or "tool output"}')
    return result.stdout

def check(name, value):
    checks[name] = bool(value)
    if not value:
        raise RuntimeError(f'Bundle verification failed: {name}')

def bundletool(*command, logfile=None):
    return run(['java', '-jar', args.bundletool, *command], logfile)

bundletool('validate', f'--bundle={args.bundle}', logfile='bundletool-validate.log')
check('bundletoolValidate', True)
jar = run(['jarsigner', '-verify', args.bundle], 'jarsigner.log')
check('jarSignature', 'jar verified.' in jar and 'unsigned entries' not in jar.lower())
der = run(['keytool', '-exportcert', '-keystore', props['storeFile'], '-alias', props['keyAlias'],
           '-storepass:file', props['storePasswordFile']], binary=True)
certificate_sha = hashlib.sha256(der).hexdigest()
bundle_cert = run(['keytool', '-printcert', '-jarfile', args.bundle], 'bundle-certificate.log')
fingerprints = re.findall(r'SHA256:\s*([A-Fa-f0-9:]+)', bundle_cert)
check('expectedUploadCertificate', any(f.replace(':', '').lower() == certificate_sha for f in fingerprints))
check('nonDebugCertificate', 'Android Debug' not in bundle_cert)
manifest_text = bundletool('dump', 'manifest', f'--bundle={args.bundle}', '--module=base', logfile='manifest.xml')
manifest = ET.fromstring(manifest_text)
android = '{http://schemas.android.com/apk/res/android}'
attr = lambda node, key, default=None: node.get(android + key, default)
app = manifest.find('application')
uses = manifest.find('uses-sdk')
check('applicationId', manifest.get('package') == 'com.miraclepenguin.bjj')
check('versionName', attr(manifest, 'versionName') == version['versionName'])
check('versionCode', int(attr(manifest, 'versionCode')) == version['versionCode'])
check('targetSdk36', int(attr(uses, 'targetSdkVersion')) == 36)
check('minSdk23Preserved', int(attr(uses, 'minSdkVersion')) == 23)
check('releaseNotDebuggable', attr(app, 'debuggable', 'false') == 'false')
check('notTestOnly', attr(app, 'testOnly', 'false') == 'false')
check('backupDisabled', attr(app, 'allowBackup') == 'false' and attr(app, 'fullBackupContent') == 'false')
check('deviceTransferRulesDeclared', attr(app, 'dataExtractionRules') is not None)
check('cleartextDisabled', attr(app, 'usesCleartextTraffic', 'false') == 'false')
activities = app.findall('activity')
check('launcherPreserved', any(attr(a, 'name') == 'com.miraclepenguin.bjj.MainActivity' and attr(a, 'exported') == 'true' for a in activities))
check('loginDeepLinkPreserved', any(attr(d, 'scheme') == 'bjjapp' and attr(d, 'host') == 'auth' for d in app.findall('.//data')))
permissions = {attr(p, 'name'): attr(p, 'maxSdkVersion') for p in manifest.findall('uses-permission')}
check('internetPermission', 'android.permission.INTERNET' in permissions)
check('storagePermissionsLimited', all(permissions.get('android.permission.' + p) == '29' for p in ['READ_EXTERNAL_STORAGE', 'WRITE_EXTERNAL_STORAGE']))
with zipfile.ZipFile(args.bundle) as archive:
    names = archive.namelist()
    config = json.loads(archive.read('base/assets/capacitor.config.json'))
    forbidden = [n for n in names if any(part in ['.env', 'upload.properties', 'keystore.properties', 'upload-password'] or part.endswith(('.jks', '.keystore', '.p12')) for part in Path(n).parts)]
    native = [n for n in names if n.endswith('.so')]
    check('noPrivateSigningFiles', not forbidden)
    passwords = {Path(props[k]).read_bytes().strip() for k in ['storePasswordFile', 'keyPasswordFile']}
    check('passwordNotPackaged', all(secret not in archive.read(n) for n in names if not n.endswith('/') for secret in passwords))
    check('noMacMetadata', not any(any(p.startswith('._') or p in ['.DS_Store', '@eaDir'] for p in Path(n).parts) for n in names))
    check('remoteHttpsPreserved', config['server']['url'] == 'https://bjj.xn--lh0b87pnudm10a4vd.com' and config['server']['cleartext'] is False)
    check('safeAreaConfigPreserved', config['android']['adjustMarginsForEdgeToEdge'] == 'auto')
    check('darkAppStatusIcons', config['plugins']['StatusBar']['style'] == 'DARK')
    check('appShellPresent', 'base/assets/public/index.html' in names)
    # This app ships Java/DEX plugins, not ELF binaries; a new native plugin requires a new ELF audit.
    check('noUnreviewedNativeLibraries', not native)

sign_args = [f'--ks={props["storeFile"]}', f'--ks-key-alias={props["keyAlias"]}',
             f'--ks-pass=file:{props["storePasswordFile"]}', f'--key-pass=file:{props["keyPasswordFile"]}']
splits = out / 'device-splits.apks'
bundletool('build-apks', f'--bundle={args.bundle}', f'--output={splits}', '--overwrite', *sign_args, logfile='build-splits.log')
with zipfile.ZipFile(splits) as archive:
    split_names = [n for n in archive.namelist() if n.endswith('.apk')]
check('deviceSplitGeneration', len(split_names) > 1)
universal = out / 'universal.apks'
bundletool('build-apks', f'--bundle={args.bundle}', f'--output={universal}', '--mode=universal', '--overwrite', *sign_args, logfile='build-universal.log')
apk = out / f'BJJ-TrainingLog-{version["versionName"]}.apk'
with zipfile.ZipFile(universal) as archive:
    apk.write_bytes(archive.read('universal.apk'))
apk_cert = run([tools / 'apksigner', 'verify', '--verbose', '--print-certs', apk], 'apk-signature.log')
check('generatedApkSignature', certificate_sha in apk_cert.lower())
run([tools / 'zipalign', '-c', '-P', '16', '4', apk], 'apk-alignment.log')
check('apkZipAlignment', True)
backup_xml = run([tools / 'aapt2', 'dump', 'xmltree', '--file', 'res/xml/data_extraction_rules.xml', apk], 'backup-rules.log')
check('cloudAndDeviceTransferExcluded', 'cloud-backup' in backup_xml and 'device-transfer' in backup_xml and backup_xml.count('E: exclude') == 10)
badging = run([tools / 'aapt2', 'dump', 'badging', apk], 'apk-badging.log')
check('generatedApkVersion', f"versionName='{version['versionName']}'" in badging and f"versionCode='{version['versionCode']}'" in badging)
check('generatedApkTarget', "targetSdkVersion:'36'" in badging)
report = {'status': 'pass', 'versionName': version['versionName'], 'versionCode': version['versionCode'],
          'applicationId': manifest.get('package'), 'targetSdk': 36, 'minSdk': 23,
          'bundle': str(args.bundle.resolve()), 'bundleBytes': args.bundle.stat().st_size,
          'bundleSha256': hashlib.sha256(args.bundle.read_bytes()).hexdigest(), 'certificateSha256': certificate_sha,
          'bundletoolSha256': hashlib.sha256(args.bundletool.read_bytes()).hexdigest(),
          'splitApkCount': len(split_names), 'nativeLibraryCount': len(native),
          'elf16KbAudit': 'not_applicable_no_native_libraries', 'checks': checks,
          'generatedApk': str(apk), 'storeUploadPerformed': False,
          'deviceRuntime': 'not_checked_by_this_script'}
(out / 'verification.json').write_text(json.dumps(report, indent=2) + '\n')
print(json.dumps(report, indent=2))
