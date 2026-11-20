#!/usr/bin/env python3
"""Create an upload identity once, outside the checkout. Never prints a password."""
import os
from pathlib import Path
import secrets
import subprocess

private = Path(os.environ.get('BJJ_SIGNING_DIR', str(Path.home() / '.config/bjj-mobile'))).resolve()
checkout = Path(__file__).resolve().parents[2]
if private == checkout or checkout in private.parents:
    raise SystemExit('Signing material must be outside the checkout')
private.mkdir(mode=0o700, parents=True, exist_ok=True)
if private.stat().st_mode & 0o077:
    raise SystemExit('Signing directory must be owner-only (0700)')
store = private / 'upload.p12'
password = private / 'upload-password'
properties = private / 'upload.properties'
certificate = private / 'upload-certificate.pem'
paths = [store, password, properties, certificate]
if any(p.exists() for p in paths):
    if not all(p.is_file() for p in paths):
        raise SystemExit('Partial signing identity exists; refusing to replace any existing key')
    print(f'Existing upload identity preserved: {properties}')
    raise SystemExit(0)
os.umask(0o077)
with password.open('x') as out:
    out.write(secrets.token_urlsafe(48) + '\n')
keytool = str(Path(os.environ['JAVA_HOME']) / 'bin/keytool') if os.environ.get('JAVA_HOME') else 'keytool'
subprocess.run([keytool, '-genkeypair', '-keystore', str(store), '-storetype', 'PKCS12',
                '-alias', 'bjj-upload', '-keyalg', 'RSA', '-keysize', '4096', '-validity', '10000',
                '-dname', 'CN=BJJ Android Upload', '-storepass:file', str(password)], check=True)
subprocess.run([keytool, '-exportcert', '-rfc', '-keystore', str(store), '-alias', 'bjj-upload',
                '-storepass:file', str(password), '-file', str(certificate)], check=True)
with properties.open('x') as out:
    out.write(f'storeFile={store}\nkeyAlias=bjj-upload\nstorePasswordFile={password}\nkeyPasswordFile={password}\n')
for path in paths:
    path.chmod(0o600)
print(f'Upload identity created: {properties}; back up this private directory securely')
