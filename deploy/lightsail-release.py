#!/usr/bin/python3
"""Restricted SSH entry point: deploy the successful CI revision at public main.

Install root-owned as /usr/local/sbin/schematica-deploy. The dedicated SSH key
may invoke only this command, with one commit hash on stdin. No repository
script runs on the host; tests run in the application container.
"""
import fcntl
import hashlib
import json
import os
from pathlib import Path
import re
import signal
import subprocess
import sys
import tarfile
import tempfile
import time
import urllib.request

REPO = 'HenryCooper86/Schematica'
BASE = Path('/opt/schematica')
HEALTH = 'https://bionicloud.net/healthz'


def run(*args, capture=False):
    result = subprocess.run(args, check=True, text=True,
                            stdout=subprocess.PIPE if capture else None, timeout=600)
    return result.stdout.strip() if capture else None


def api(path):
    req = urllib.request.Request(f'https://api.github.com/repos/{REPO}/{path}',
                                 headers={'Accept': 'application/vnd.github+json',
                                          'User-Agent': 'Schematica-release'})
    with urllib.request.urlopen(req, timeout=30) as response:
        return json.load(response)


def eligible(sha):
    if api('commits/main')['sha'] != sha:
        raise ValueError('Revision is no longer the current main commit')
    runs = api(f'actions/workflows/ci.yml/runs?head_sha={sha}&event=push&branch=main&per_page=30')['workflow_runs']
    matching = [r for r in runs if r['head_sha'] == sha and r['head_branch'] == 'main'
                and r['event'] == 'push' and r['head_repository']['full_name'] == REPO]
    latest = max(matching, key=lambda r: (r['id'], r.get('run_attempt', 1)), default={})
    if latest.get('status') != 'completed' or latest.get('conclusion') != 'success':
        raise ValueError('Latest main CI run for this revision has not succeeded')


def compose(release, *args, override=None):
    command = ['docker', 'compose', '--project-directory', str(release),
               '--env-file', str(release / '.env'), '-p', 'schematica',
               '-f', str(release / 'compose.yaml')]
    if override:
        command += ['-f', str(override)]
    run(*command, *args)


def healthy(expected_release=None):
    for _ in range(12):
        try:
            with urllib.request.urlopen(HEALTH, timeout=10) as response:
                if response.status == 200 and json.load(response) == {'status': 'ok'}:
                    if expected_release:
                        with urllib.request.urlopen('https://bionicloud.net/src/engineering.js', timeout=10) as asset:
                            actual = hashlib.sha256(asset.read()).digest()
                        expected = hashlib.sha256((expected_release / 'src/engineering.js').read_bytes()).digest()
                        if actual != expected:
                            raise ValueError('Public application revision does not match the release')
                    return
        except (OSError, ValueError):
            pass
        time.sleep(5)
    raise RuntimeError('Public HTTPS health check failed')


def deploy(sha):
    eligible(sha)
    previous = (BASE / 'current').resolve(strict=True)
    if (previous / 'REVISION').read_text().strip() == sha:
        healthy(previous)
        print(f'Already deployed and healthy: {sha}', flush=True)
        return
    release = BASE / 'releases' / f'{time.strftime("%Y%m%d-%H%M%S", time.gmtime())}-{sha[:12]}'
    release.mkdir(mode=0o755)
    with tempfile.TemporaryDirectory(prefix='schematica-release-') as scratch:
        archive = Path(scratch) / 'source.tar.gz'
        req = urllib.request.Request(f'https://codeload.github.com/{REPO}/tar.gz/{sha}')
        with urllib.request.urlopen(req, timeout=60) as source, archive.open('wb') as out:
            while chunk := source.read(1024 * 1024):
                out.write(chunk)
        with tarfile.open(archive) as tar:
            # Strip only the verified GitHub archive prefix; reject links and devices.
            prefix = f'Schematica-{sha}/'
            members = []
            for member in tar.getmembers():
                if member.name == prefix.rstrip('/'):
                    continue
                if not member.name.startswith(prefix):
                    raise ValueError('Unexpected archive root')
                member.name = member.name[len(prefix):]
                if not member.name:
                    continue
                if not (member.isfile() or member.isdir()):
                    raise ValueError('Release archives must contain only files and directories')
                members.append(member)
            tar.extractall(release, members=members, filter='data')
        # Environment and TLS state stay on the server, outside the archive.
        (release / '.env').write_bytes((previous / '.env').read_bytes())
        (release / '.env').chmod(0o600)
        (release / 'REVISION').write_text(sha + '\n')
        compose(release, 'config', '--quiet')
        old_image = run('docker', 'inspect', 'schematica-app-1', '--format', '{{.Image}}', capture=True)
        rollback_tag = 'schematica-rollback:' + sha[:12]
        run('docker', 'tag', old_image, rollback_tag)
        override = Path(scratch) / 'rollback.yaml'
        override.write_text(f'services:\n  app:\n    image: {rollback_tag}\n    pull_policy: never\n')
        compose(release, 'build', 'app')
        run('docker', 'run', '--rm', '--network', 'none', '--read-only',
            '--cap-drop', 'ALL', '--security-opt', 'no-new-privileges:true',
            '--tmpfs', '/tmp:rw,nosuid,nodev', '--entrypoint', 'node',
            '-v', f'{release}:/verification:ro', '-w', '/verification', 'schematica-app', '--test')
        eligible(sha)  # A newer push during the build must not be overwritten.
        try:
            compose(release, 'up', '-d', '--no-build', '--wait', '--wait-timeout', '120')
            healthy(release)
            link = BASE / ('current-' + sha)
            link.symlink_to(release)
            os.replace(link, BASE / 'current')
        except Exception:
            print('Activation failed; restoring the previous image and configuration.', flush=True)
            compose(previous, 'up', '-d', '--no-build', '--wait', '--wait-timeout', '120', override=override)
            healthy(previous)
            raise
    print(f'Deployed and healthy: {sha}', flush=True)


def main():
    if not hasattr(tarfile, 'data_filter'):
        raise SystemExit('Python with tarfile data-filter support is required (use Python 3.12+).')
    if len(sys.argv) != 1:
        raise ValueError('Arguments are not accepted')
    signal.alarm(20)
    sha = sys.stdin.readline(128).strip()
    signal.alarm(0)
    if not re.fullmatch('[0-9a-f]{40}', sha):
        raise ValueError('Expected one full lowercase commit hash on stdin')
    with (BASE / 'deploy.lock').open('a') as lock:
        fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        deploy(sha)


if __name__ == '__main__':
    try:
        main()
    except Exception as error:
        print(f'Deployment failed: {error}', file=sys.stderr)
        sys.exit(1)
