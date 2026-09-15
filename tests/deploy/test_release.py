"""No network or Docker needed: verify the release gate and rollback boundary."""
import importlib.util
import io
from pathlib import Path
import tarfile
import tempfile
import unittest
from unittest.mock import patch

spec = importlib.util.spec_from_file_location('release', Path(__file__).parents[2] / 'deploy/lightsail-release.py')
release = importlib.util.module_from_spec(spec)
spec.loader.exec_module(release)
SHA = 'a' * 40


class ReleaseTests(unittest.TestCase):
    def test_gate_rejects_stale_main(self):
        with patch.object(release, 'api', return_value={'sha': 'b' * 40}):
            with self.assertRaisesRegex(ValueError, 'current main'):
                release.eligible(SHA)

    def test_gate_requires_latest_successful_push_from_this_repository(self):
        good = {'id': 1, 'head_sha': SHA, 'head_branch': 'main', 'event': 'push',
                'head_repository': {'full_name': release.REPO}, 'status': 'completed', 'conclusion': 'success'}
        for runs, allowed in [([good], True), ([], False),
                              ([good, dict(good, id=2, conclusion='failure')], False),
                              ([dict(good, event='pull_request')], False),
                              ([dict(good, head_repository={'full_name': 'someone/fork'})], False)]:
            with self.subTest(runs=runs), patch.object(release, 'api', side_effect=[{'sha': SHA}, {'workflow_runs': runs}]):
                if allowed:
                    release.eligible(SHA)
                else:
                    with self.assertRaises(ValueError):
                        release.eligible(SHA)

    def test_bad_input_never_reaches_deployment(self):
        with patch.object(release.sys, 'argv', ['deploy']), patch.object(release.sys, 'stdin', io.StringIO('main; shell\n')), patch.object(release, 'deploy') as deploy:
            with self.assertRaises(ValueError):
                release.main()
            deploy.assert_not_called()

    def simulate(self, failure=None):
        with tempfile.TemporaryDirectory() as folder:
            base = Path(folder).resolve()
            previous = base / 'releases' / 'old'
            previous.mkdir(parents=True)
            (previous / '.env').write_text('SCHEMATICA_DOMAIN=bionicloud.net\n')
            (previous / 'REVISION').write_text('b' * 40)
            (base / 'current').symlink_to(previous)
            archive = io.BytesIO()
            with tarfile.open(fileobj=archive, mode='w:gz') as tar:
                root = tarfile.TarInfo(f'Schematica-{SHA}')
                root.type = tarfile.DIRTYPE
                tar.addfile(root)
                entry = tarfile.TarInfo(f'Schematica-{SHA}/compose.yaml')
                entry.size = 0
                tar.addfile(entry, io.BytesIO())
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

            health = [RuntimeError('health failed'), None] if failure == 'health' else [None]
            with patch.object(release, 'BASE', base), patch.object(release, 'eligible') as gate, patch.object(release.urllib.request, 'urlopen', return_value=archive), patch.object(release, 'run', side_effect=run), patch.object(release, 'compose', side_effect=compose), patch.object(release, 'healthy', side_effect=health):
                if failure:
                    with self.assertRaises(RuntimeError):
                        release.deploy(SHA)
                    self.assertEqual((base / 'current').resolve(), previous)
                else:
                    release.deploy(SHA)
                    self.assertEqual((base / 'current' / 'REVISION').read_text().strip(), SHA)
                    self.assertEqual(gate.call_count, 2)
                rollback = [c for c in calls if c[0] == previous and c[1][0] == 'up']
                self.assertEqual(bool(rollback), failure in ('activation', 'health'))
                if rollback:
                    self.assertIn('--no-build', rollback[0][1])
                    self.assertIsNotNone(rollback[0][2]['override'])

    def test_success_switches_current_only_after_health(self):
        self.simulate()

    def test_activation_failure_restores_previous_image(self):
        self.simulate('activation')

    def test_public_health_failure_restores_previous_image(self):
        self.simulate('health')

    def test_test_failure_leaves_live_release_untouched(self):
        self.simulate('tests')


if __name__ == '__main__':
    unittest.main()
