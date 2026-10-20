#!/usr/bin/python3
"""Restricted SSH entry point: deploy the successful CI revision at main.

Install root-owned as /usr/local/sbin/schematica-deploy. The dedicated SSH key
may invoke only this command, with one bounded JSON request on stdin containing
the commit and an ephemeral read token. Tokens are never persisted or given to
containers. No repository script runs on the host.
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
import urllib.error
import urllib.parse

REPO = 'HenryCooper86/Schematica'
BASE = Path('/opt/schematica')
HEALTH = 'https://bionicloud.net/healthz'
MAX_REQUEST_CHARS = 8192
MAX_TOKEN_CHARS = 4096
GITHUB_HOSTS = frozenset(('api.github.com', 'codeload.github.com'))


def run(*args, capture=False):
    result = subprocess.run(args, check=True, text=True,
                            stdout=subprocess.PIPE if capture else None, timeout=600)
    return result.stdout.strip() if capture else None


def validate_github_url(url):
    try:
        parsed = urllib.parse.urlsplit(url)
        valid = (parsed.scheme == 'https' and parsed.hostname in GITHUB_HOSTS
                 and parsed.username is None and parsed.password is None
                 and parsed.port is None and not parsed.fragment)
    except ValueError:
        valid = False
    if not valid:
        raise ValueError('Unsafe GitHub request or redirect destination')


class GitHubRedirectHandler(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        validate_github_url(newurl)
        return super().redirect_request(req, fp, code, msg, headers, newurl)


def github_open(url, token, timeout=30):
    validate_github_url(url)
    req = urllib.request.Request(url, headers={
        'Accept': 'application/vnd.github+json',
        'User-Agent': 'Schematica-release',
    })
    # urllib copies ordinary headers when following redirects. Authentication
    # belongs only to the initial request; the archive redirect is signed.
    req.add_unredirected_header('Authorization', 'Bearer ' + token)
    try:
        return urllib.request.build_opener(GitHubRedirectHandler()).open(req, timeout=timeout)
    except urllib.error.HTTPError as error:
        error.close()
        raise RuntimeError(f'GitHub request failed with HTTP {error.code}') from None
    except (urllib.error.URLError, OSError):
        raise RuntimeError('GitHub request failed; no credentials or signed URL were logged') from None


def api(path, token):
    with github_open(f'https://api.github.com/repos/{REPO}/{path}', token) as response:
        return json.load(response)


def eligible(sha, token):
    if api('commits/main', token)['sha'] != sha:
        raise ValueError('Revision is no longer the current main commit')
    runs = api(f'actions/workflows/ci.yml/runs?head_sha={sha}&event=push&branch=main&per_page=30', token)['workflow_runs']
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


def deploy(sha, token):
    eligible(sha, token)
    previous = (BASE / 'current').resolve(strict=True)
    if (previous / 'REVISION').read_text().strip() == sha:
        healthy(previous)
        print(f'Already deployed and healthy: {sha}', flush=True)
        return
    release = BASE / 'releases' / f'{time.strftime("%Y%m%d-%H%M%S", time.gmtime())}-{sha[:12]}'
    release.mkdir(mode=0o755)
    with tempfile.TemporaryDirectory(prefix='schematica-release-') as scratch:
        archive = Path(scratch) / 'source.tar.gz'
        url = f'https://api.github.com/repos/{REPO}/tarball/{sha}'
        with github_open(url, token, timeout=60) as source, archive.open('wb') as out:
            while chunk := source.read(1024 * 1024):
                out.write(chunk)
        with tarfile.open(archive) as tar:
            # The request pins the full commit. GitHub abbreviates public archive
            # roots, while private signed archives retain the full hash.
            roots = (f'{REPO.replace("/", "-")}-{sha}',
                     f'{REPO.replace("/", "-")}-{sha[:7]}')
            prefix = None
            members = []
            for member in tar.getmembers():
                if prefix is None:
                    root = member.name.partition('/')[0]
                    if root not in roots:
                        raise ValueError('Unexpected archive root')
                    prefix = root + '/'
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
        eligible(sha, token)  # A newer push during the build must not be overwritten.
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


def read_request(stream):
    line = stream.readline(MAX_REQUEST_CHARS + 1)
    if not line or len(line) > MAX_REQUEST_CHARS or not line.endswith('\n'):
        raise ValueError('Expected one bounded newline-terminated release request')
    if stream.read(1):
        raise ValueError('Only one release request is accepted')
    try:
        request = json.loads(line)
    except (ValueError, TypeError):
        raise ValueError('Invalid release request JSON') from None
    if not isinstance(request, dict) or set(request) != {'sha', 'token'}:
        raise ValueError('Release request requires exactly sha and token')
    sha, token = request['sha'], request['token']
    if not isinstance(sha, str) or not re.fullmatch('[0-9a-f]{40}', sha):
        raise ValueError('Expected one full lowercase commit hash')
    if (not isinstance(token, str) or not 1 <= len(token) <= MAX_TOKEN_CHARS
            or not all(33 <= ord(char) <= 126 for char in token)):
        raise ValueError('Expected a bounded token without whitespace or control characters')
    return sha, token


def main():
    if not hasattr(tarfile, 'data_filter'):
        raise SystemExit('Python with tarfile data-filter support is required (use Python 3.12+).')
    if len(sys.argv) != 1:
        raise ValueError('Arguments are not accepted')
    signal.alarm(20)
    sha, token = read_request(sys.stdin)
    signal.alarm(0)
    with (BASE / 'deploy.lock').open('a') as lock:
        fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        deploy(sha, token)


if __name__ == '__main__':
    try:
        main()
    except Exception as error:
        print(f'Deployment failed: {error}', file=sys.stderr)
        sys.exit(1)
