"""No network or Docker needed: verify the release gate and rollback boundary."""
import importlib.util
import io
from pathlib import Path
import signal
import tarfile
import tempfile
import unittest
from unittest.mock import patch

spec = importlib.util.spec_from_file_location('release', Path(__file__).parents[2] / 'deploy/lightsail-release.py')
release = importlib.util.module_from_spec(spec)
spec.loader.exec_module(release)
SHA = 'a' * 40
TOKEN = 'ghs_' + 'f' * 36
requires_data_filter = unittest.skipUnless(
    hasattr(tarfile, 'data_filter'),
    'Deployment requires Python 3.12+ tarfile data-filter support',
)


class ReleaseTests(unittest.TestCase):
    def test_gate_rejects_stale_main(self):
        with patch.object(release, 'api', return_value={'sha': 'b' * 40}):
            with self.assertRaises(ValueError):
                release.eligible(SHA, TOKEN)

    def test_gate_requires_latest_successful_push_from_this_repository(self):
        good = {'id': 1, 'head_sha': SHA, 'head_branch': 'main', 'event': 'push',
                'head_repository': {'full_name': release.REPO}, 'status': 'completed', 'conclusion': 'success'}
        for runs, allowed in [([good], True), ([], False),
                              ([good, dict(good, id=2, conclusion='failure')], False),
                              ([dict(good, event='pull_request')], False),
                              ([dict(good, head_repository={'full_name': 'someone/fork'})], False)]:
            with self.subTest(runs=runs), patch.object(release, 'api', side_effect=[{'sha': SHA}, {'workflow_runs': runs}]):
                if allowed:
                    release.eligible(SHA, TOKEN)
                else:
                    with self.assertRaises(ValueError):
                        release.eligible(SHA, TOKEN)

    @requires_data_filter
    def test_bad_input_never_reaches_deployment(self):
        try:
            with patch.object(release.sys, 'argv', ['deploy']), patch.object(release.sys, 'stdin', io.StringIO('{"sha":"main; shell","token":"' + TOKEN + '"}\n')), patch.object(release, 'deploy') as deploy:
                with self.assertRaises(ValueError):
                    release.main()
                deploy.assert_not_called()
        finally:
            signal.alarm(0)

    def simulate(self, failure=None, public_archive=False):
        with tempfile.TemporaryDirectory() as folder:
            base = Path(folder).resolve()
            previous = base / 'releases' / 'old'
            previous.mkdir(parents=True)
            (previous / '.env').write_text('SCHEMATICA_DOMAIN=bionicloud.net\n')
            (previous / 'REVISION').write_text('b' * 40)
            (base / 'current').symlink_to(previous)
            archive_ref = SHA[:7] if public_archive else SHA
            prefix = f'{release.REPO.replace("/", "-")}-{archive_ref}/'
            archive = io.BytesIO()
            with tarfile.open(fileobj=archive, mode='w:gz') as tar:
                root = tarfile.TarInfo(prefix.rstrip('/'))
                root.type = tarfile.DIRTYPE
                tar.addfile(root)
                entry = tarfile.TarInfo(prefix + 'compose.yaml')
                entry.size = 0
                tar.addfile(entry, io.BytesIO())
                env = tarfile.TarInfo(prefix + '.env')
                env.size = len('SCHEMATICA_DOMAIN=evil.example\n')
                tar.addfile(env, io.BytesIO(b'SCHEMATICA_DOMAIN=evil.example\n'))
            archive.seek(0)
            calls = []

            def compose(path, *args, **kwargs):
                calls.append((path, args, kwargs))
                if failure == 'activation' and args[0] == 'up' and path != previous:
                    raise RuntimeError('activation failed')

            def run(*args, **kwargs):
                if failure == 'tests' and args[:2] == ('docker', 'run'):
                    raise RuntimeError('tests failed')
                return 'old-image-id' if kwargs.get('capture') else None

            def healthy(path):
                self.assertEqual((base / 'current').resolve(), previous)
                if failure == 'health' and path != previous:
                    raise RuntimeError('health failed')
            with patch.object(release, 'BASE', base), patch.object(release, 'eligible') as gate, patch.object(release, 'github_open', return_value=archive), patch.object(release, 'run', side_effect=run), patch.object(release, 'compose', side_effect=compose), patch.object(release, 'healthy', side_effect=healthy):
                if failure == 'gate':
                    gate.side_effect = [None, ValueError('main changed during build')]
                if failure:
                    with self.assertRaises((RuntimeError, ValueError)):
                        release.deploy(SHA, TOKEN)
                    self.assertEqual((base / 'current').resolve(), previous)
                else:
                    release.deploy(SHA, TOKEN)
                    self.assertEqual((base / 'current' / 'REVISION').read_text().strip(), SHA)
                    self.assertEqual((base / 'current' / '.env').read_text(), 'SCHEMATICA_DOMAIN=bionicloud.net\n')
                rollback = [c for c in calls if c[0] == previous and c[1][0] == 'up']
                if failure in ('tests', 'gate'):
                    self.assertFalse(any(c[1][0] == 'up' for c in calls))
                self.assertEqual(bool(rollback), failure in ('activation', 'health'))
                if rollback:
                    self.assertIn('--no-build', rollback[0][1])
                    self.assertIsNotNone(rollback[0][2]['override'])

    @requires_data_filter
    def test_success_switches_current_only_after_health(self):
        self.simulate()

    @requires_data_filter
    def test_public_archive_switches_current_after_health(self):
        self.simulate(public_archive=True)

    @requires_data_filter
    def test_activation_failure_restores_previous_image(self):
        self.simulate('activation')

    @requires_data_filter
    def test_public_health_failure_restores_previous_image(self):
        self.simulate('health')

    @requires_data_filter
    def test_test_failure_leaves_live_release_untouched(self):
        self.simulate('tests')

    @requires_data_filter
    def test_main_changing_during_build_prevents_activation(self):
        self.simulate('gate')


if __name__ == '__main__':
    unittest.main()
