#!/usr/bin/env python3
"""Task-062 file transfer / Python execution using existing Ubuntu -> M4 SSH."""
import argparse
import base64
import hashlib
from pathlib import Path
import shlex
import subprocess

REMOTE_ROOT = '/Users/brownjeon/.local/share/bjj-rive'


def command(argv):
    inner = ['ssh', '-o', 'BatchMode=yes', '-o', 'StrictHostKeyChecking=yes',
             '-o', 'ConnectTimeout=10', 'brownjeon@192.168.219.100', shlex.join(argv)]
    return ['ssh', '-o', 'BatchMode=yes', '-o', 'ConnectTimeout=10',
            'home_ubuntu', shlex.join(inner)]


def remote_path(value):
    p = Path(value)
    if '..' in p.parts or not value.startswith(REMOTE_ROOT + '/'):
        raise ValueError('Path must stay inside task Blender workspace')
    return value


def main():
    p = argparse.ArgumentParser(description=__doc__)
    sub = p.add_subparsers(dest='mode', required=True)
    run = sub.add_parser('run')
    run.add_argument('script', type=Path)
    put = sub.add_parser('put')
    put.add_argument('source', type=Path)
    put.add_argument('destination', type=remote_path)
    get = sub.add_parser('get')
    get.add_argument('source', type=remote_path)
    get.add_argument('destination', type=Path)
    args = p.parse_args()
    if args.mode == 'run':
        result = subprocess.run(command(['python3', '-u', '-']), input=args.script.read_bytes())
    elif args.mode == 'put':
        data = args.source.read_bytes()
        digest = hashlib.sha256(data).hexdigest()
        script = (
            'from pathlib import Path\nimport base64,hashlib\n'
            f'p=Path({args.destination!r})\np.parent.mkdir(parents=True,exist_ok=True)\n'
            f'b=base64.b64decode({base64.b64encode(data).decode()!r})\n'
            f'assert hashlib.sha256(b).hexdigest()=={digest!r}\n'
            'p.write_bytes(b)\nprint(str(p),len(b),hashlib.sha256(b).hexdigest())\n'
        )
        result = subprocess.run(command(['python3', '-u', '-']), input=script.encode())
    else:
        args.destination.parent.mkdir(parents=True, exist_ok=True)
        temp = args.destination.with_name(args.destination.name + '.part')
        with temp.open('wb') as output:
            result = subprocess.run(command(['cat', args.source]), stdout=output)
        if result.returncode == 0:
            temp.replace(args.destination)
            print(str(args.destination), args.destination.stat().st_size,
                  hashlib.sha256(args.destination.read_bytes()).hexdigest())
        else:
            temp.unlink(missing_ok=True)
    raise SystemExit(result.returncode)


if __name__ == '__main__':
    main()
