"""Security regressions for the private authenticated release path."""
import importlib.util
import io
from email.message import Message
import json
import tarfile
import tempfile
import unittest
import urllib.error
import urllib.request
from urllib.response import addinfourl
from pathlib import Path
from unittest.mock import MagicMock, patch

spec = importlib.util.spec_from_file_location('release_private', Path(__file__).parents[2] / 'deploy/lightsail-release.py')
release = importlib.util.module_from_spec(spec)
spec.loader.exec_module(release)

SHA = 'a' * 40
TOKEN = 'ghs_' + 'f' * 36
PREFIX = f'{release.REPO.replace("/", "-")}-{SHA}/'
requires_data_filter = unittest.skipUnless(
    hasattr(tarfile, 'data_filter'),
    'Deployment requires Python 3.12+ tarfile data-filter support',
)


def json_request(sha=SHA, token=TOKEN):
    return json.dumps({'sha': sha, 'token': token})


class ReadRequestTests(unittest.TestCase):
    def test_accepts_bounded_json_request(self):
        self.assertEqual(release.read_request(io.StringIO(json_request() + '\n')), (SHA, TOKEN))

    def test_rejects_empty_stream(self):
        with self.assertRaises(ValueError):
            release.read_request(io.StringIO(''))

    def test_rejects_missing_newline(self):
        with self.assertRaises(ValueError):
            release.read_request(io.StringIO(json_request()))

    def test_rejects_missing_sha(self):
        with self.assertRaises(ValueError):
            release.read_request(io.StringIO(json.dumps({'token': TOKEN}) + '\n'))

    def test_rejects_missing_token(self):
        with self.assertRaises(ValueError):
            release.read_request(io.StringIO(json.dumps({'sha': SHA}) + '\n'))

    def test_rejects_unknown_key(self):
        with self.assertRaises(ValueError):
            release.read_request(io.StringIO(json.dumps({'sha': SHA, 'token': TOKEN, 'extra': 1}) + '\n'))

    def test_rejects_non_string_sha(self):
        with self.assertRaises(ValueError):
            release.read_request(io.StringIO(json.dumps({'sha': 12345, 'token': TOKEN}) + '\n'))

    def test_rejects_non_string_token(self):
        with self.assertRaises(ValueError):
            release.read_request(io.StringIO(json.dumps({'sha': SHA, 'token': ['tok']}) + '\n'))

    def test_rejects_non_hex_sha(self):
        with self.assertRaises(ValueError):
            release.read_request(io.StringIO(json.dumps({'sha': 'z' * 40, 'token': TOKEN}) + '\n'))

    def test_rejects_uppercase_sha(self):
        with self.assertRaises(ValueError):
            release.read_request(io.StringIO(json.dumps({'sha': SHA.upper(), 'token': TOKEN}) + '\n'))

    def test_rejects_short_sha(self):
        with self.assertRaises(ValueError):
            release.read_request(io.StringIO(json.dumps({'sha': 'a' * 39, 'token': TOKEN}) + '\n'))

    def test_rejects_token_whitespace(self):
        for bad in ('tok en', 'tok\ten', 'tok\nen', 'tok\ren'):
            with self.subTest(bad=repr(bad)):
                with self.assertRaises(ValueError):
                    release.read_request(io.StringIO(json.dumps({'sha': SHA, 'token': bad}) + '\n'))

    def test_rejects_token_control_character(self):
        with self.assertRaises(ValueError):
            release.read_request(io.StringIO(json.dumps({'sha': SHA, 'token': 'tok\x01en'}) + '\n'))

    def test_rejects_empty_token(self):
        with self.assertRaises(ValueError):
            release.read_request(io.StringIO(json.dumps({'sha': SHA, 'token': ''}) + '\n'))

    def test_rejects_oversize_token(self):
        with self.assertRaises(ValueError):
            release.read_request(io.StringIO(json.dumps({'sha': SHA, 'token': 't' * 4097}) + '\n'))

    def test_rejects_oversize_payload(self):
        payload = json_request() + ' ' * release.MAX_REQUEST_CHARS
        with self.assertRaises(ValueError):
            release.read_request(io.StringIO(payload + '\n'))

    def test_rejects_trailing_data_after_request(self):
        with self.assertRaises(ValueError):
            release.read_request(io.StringIO(json_request() + '\n' + json_request() + '\n'))




class GitHubOpenRejectionTests(unittest.TestCase):
    def assert_rejected(self, url):
        with self.assertRaises(ValueError):
            release.github_open(url, TOKEN)

    def test_rejects_plain_http(self):
        self.assert_rejected('http://api.github.com/repos/' + release.REPO + '/tarball/' + SHA)

    def test_rejects_foreign_host(self):
        self.assert_rejected('https://evil.example/repos/' + release.REPO + '/tarball/' + SHA)

    def test_rejects_host_suffix_spoof(self):
        self.assert_rejected('https://api.github.com.evil.example/x')

    def test_rejects_url_credentials(self):
        self.assert_rejected('https://user:pass@api.github.com/x')

    def test_rejects_custom_port(self):
        self.assert_rejected('https://api.github.com:8443/x')

    def test_rejects_fragment(self):
        self.assert_rejected('https://api.github.com/x#frag')



class RedirectTests(unittest.TestCase):
    def assert_redirect_rejected(self, newurl):
        handler = release.GitHubRedirectHandler()
        req = urllib.request.Request('https://api.github.com/x')
        with self.assertRaises(ValueError):
            handler.redirect_request(req, None, 302, 'Found', {}, newurl)

    def test_authenticated_download_follows_redirect_without_leaking_token(self):
        initial = f'https://api.github.com/repos/{release.REPO}/tarball/{SHA}'
        destination = f'https://codeload.github.com/{release.REPO}/tar.gz/{SHA}?signed=private'
        requests = []

        class Transport(urllib.request.HTTPSHandler):
            def https_open(self, req):
                requests.append((req.full_url, req.get_header('Authorization')))
                headers = Message()
                redirected = req.full_url == destination
                if not redirected:
                    headers['Location'] = destination
                response = addinfourl(io.BytesIO(b'archive'), headers, req.full_url,
                                      200 if redirected else 302)
                response.msg = 'OK' if redirected else 'Found'
                return response

        build_opener = urllib.request.build_opener
        with patch.object(release.urllib.request, 'build_opener',
                          side_effect=lambda *handlers: build_opener(*handlers, Transport())):
            with release.github_open(initial, TOKEN) as response:
                response.read()
        self.assertEqual(requests, [(initial, 'Bearer ' + TOKEN), (destination, None)])

    def test_redirect_rejects_plain_http(self):
        self.assert_redirect_rejected('http://codeload.github.com/x')

    def test_redirect_rejects_foreign_host(self):
        self.assert_redirect_rejected('https://evil.example/x')

    def test_redirect_rejects_credentials(self):
        self.assert_redirect_rejected('https://user:pass@codeload.github.com/x')

    def test_redirect_rejects_custom_port(self):
        self.assert_redirect_rejected('https://codeload.github.com:8443/x')


class SecretSafeErrorTests(unittest.TestCase):
    def test_http_error_hides_token_and_signed_url(self):
        signed = 'https://codeload.github.com/' + release.REPO + '/tar.gz/' + SHA + '?X-Amz-Signature=SIGNEDSECRET'
        with patch.object(release.urllib.request, 'build_opener') as build:
            opener = MagicMock()
            build.return_value = opener
            opener.open.side_effect = urllib.error.HTTPError(signed, 500, 'Internal Server Error', {}, None)
            with self.assertRaises(RuntimeError) as ctx:
                release.github_open('https://api.github.com/repos/' + release.REPO + '/tarball/' + SHA, TOKEN)
            message = str(ctx.exception)
            self.assertNotIn(TOKEN, message)
            self.assertNotIn('SIGNEDSECRET', message)
            self.assertNotIn('codeload', message)

    def test_network_error_hides_credentials(self):
        with patch.object(release.urllib.request, 'build_opener') as build:
            opener = MagicMock()
            build.return_value = opener
            opener.open.side_effect = urllib.error.URLError('failed with ' + TOKEN + ' leaked')
            with self.assertRaises(RuntimeError) as ctx:
                release.github_open('https://api.github.com/x', TOKEN)
            self.assertNotIn(TOKEN, str(ctx.exception))


@requires_data_filter
class ArchiveRejectionTests(unittest.TestCase):
    def build(self, members):
        archive = io.BytesIO()
        with tarfile.open(fileobj=archive, mode='w:gz') as tar:
            for name, kind, linkname in members:
                info = tarfile.TarInfo(name)
                info.type = kind
                if linkname is not None:
                    info.linkname = linkname
                info.size = 0
                tar.addfile(info, io.BytesIO() if kind == tarfile.REGTYPE else None)
        archive.seek(0)
        return archive

    def deploy_with(self, archive):
        with tempfile.TemporaryDirectory() as folder:
            base = Path(folder).resolve()
            previous = base / 'releases' / 'old'
            previous.mkdir(parents=True)
            (previous / '.env').write_text('SCHEMATICA_DOMAIN=bionicloud.net\n')
            (previous / 'REVISION').write_text('b' * 40)
            (base / 'current').symlink_to(previous)
            try:
                with patch.object(release, 'BASE', base), patch.object(release, 'eligible'), patch.object(release, 'github_open', return_value=archive), patch.object(release, 'compose'), patch.object(release, 'run'), patch.object(release, 'healthy'):
                    release.deploy(SHA, TOKEN)
            finally:
                self.assertEqual((base / 'current').resolve(), previous)
                self.assertEqual((previous / '.env').read_text(), 'SCHEMATICA_DOMAIN=bionicloud.net\n')
                self.assertFalse(list(base.rglob('passwd')))

    def test_rejects_foreign_archive_root(self):
        archive = self.build([(f'Schematica-{SHA}/compose.yaml', tarfile.REGTYPE, None)])
        with self.assertRaises(ValueError):
            self.deploy_with(archive)

    def test_rejects_traversal_member(self):
        archive = self.build([(PREFIX + '../../etc/passwd', tarfile.REGTYPE, None)])
        with self.assertRaises(tarfile.FilterError):
            self.deploy_with(archive)

    def test_rejects_symlink(self):
        archive = self.build([(PREFIX + 'link', tarfile.SYMTYPE, '/etc/passwd')])
        with self.assertRaises(ValueError):
            self.deploy_with(archive)

    def test_rejects_hardlink(self):
        archive = self.build([(PREFIX + 'target', tarfile.REGTYPE, None),
                              (PREFIX + 'hardlink', tarfile.LNKTYPE, 'target')])
        with self.assertRaises(ValueError):
            self.deploy_with(archive)

    def test_rejects_device_files(self):
        for kind in (tarfile.CHRTYPE, tarfile.BLKTYPE, tarfile.FIFOTYPE):
            with self.subTest(kind=kind):
                archive = self.build([(PREFIX + 'device', kind, None)])
                with self.assertRaises(ValueError):
                    self.deploy_with(archive)


if __name__ == '__main__':
    unittest.main()
