import hashlib
import importlib.util
import io
import json
from pathlib import Path
import tarfile
import tempfile
import unittest
from unittest import mock

ROOT = Path(__file__).resolve().parents[2]


def load(name, relative):
    spec = importlib.util.spec_from_file_location(name, ROOT / relative)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


policy = load('publisher_test', 'deployment/publish-apixdoc.py')
gateway = load('gateway_test', 'deployment/apixdoc-ssh-gateway.py')
packager = load('packager_test', 'scripts/package-apixdoc.py')
REVISION = 'a' * 40


def make_archive(target, additions=None, hashes=None, missing=None, special=None):
    content = {name: b'fixture' for name in policy.ROOT_REQUIRED}
    content['prisma/migrations/20260901000000_initial/migration.sql'] = b'SELECT 1;'
    content['.next/static/fixture.js'] = b'fixture asset'
    content.update(additions or {})
    for name in missing or []:
        content.pop(name)
    digests = {name: hashlib.sha256(body).hexdigest() for name, body in content.items()}
    digests.update(hashes or {})
    content['deploy-manifest.json'] = json.dumps({'schema': 1, 'revision': REVISION, 'files': digests}).encode()
    with tarfile.open(target, 'w:gz') as archive:
        for name, body in content.items():
            member = tarfile.TarInfo(name)
            member.size = len(body)
            if special and name == special:
                member.type, member.linkname, member.size = tarfile.SYMTYPE, '/etc/passwd', 0
                archive.addfile(member)
            else:
                archive.addfile(member, io.BytesIO(body))
    return content


class DeploymentBoundary(unittest.TestCase):
    def test_gateway_accepts_only_three_fixed_commands(self):
        for action in ('receive', 'validate', 'publish'):
            self.assertEqual(gateway.parse_command(action + ' ' + REVISION), (action, REVISION))
        for value in ('', 'bash', 'publish ' + REVISION + '\n', 'publish ' + REVISION + ';id',
                      'scp -t /tmp/x', 'sftp', 'publish ../../etc/passwd', 'restart nginx.service'):
            with self.subTest(value=value), self.assertRaises(ValueError):
                gateway.parse_command(value)

    def test_path_boundary(self):
        for name in ('../x', '/etc/passwd', './server.js', '.next/../x', '.next/cache/a',
                     '.env', 'node_modules/pkg/.env.local', 'node_modules/.npmrc',
                     'public/.ssh/id_rsa', 'prisma/seed.ts', 'deployment/evil.py',
                     'src/lib/prisma.ts', 'node_modules/a.js.map'):
            with self.subTest(name=name), self.assertRaises(policy.DeployError):
                policy.allowed_member(name)

    def test_archive_preserves_generated_client_and_sql_metadata(self):
        with tempfile.TemporaryDirectory() as folder:
            archive = Path(folder) / 'x.tar.gz'
            make_archive(archive)
            files, _ = policy.inspect_archive(archive, REVISION)
            self.assertIn('node_modules/.prisma/client/default.js', files)
            self.assertIn('prisma/migrations/20260901000000_initial/migration.sql', files)

    def test_missing_generated_client_is_rejected(self):
        with tempfile.TemporaryDirectory() as folder:
            archive = Path(folder) / 'x.tar.gz'
            make_archive(archive, missing=['node_modules/.prisma/client/default.js'])
            with self.assertRaises(policy.DeployError):
                policy.inspect_archive(archive, REVISION)

    def test_archive_link_is_rejected(self):
        with tempfile.TemporaryDirectory() as folder:
            archive = Path(folder) / 'x.tar.gz'
            make_archive(archive, special='server.js')
            with self.assertRaises(policy.DeployError):
                policy.inspect_archive(archive, REVISION)

    def test_uploaded_private_env_is_rejected(self):
        with tempfile.TemporaryDirectory() as folder:
            archive = Path(folder) / 'x.tar.gz'
            make_archive(archive, additions={'.env.production': b'PRIVATE=must-not-upload'})
            with self.assertRaises(policy.DeployError):
                policy.inspect_archive(archive, REVISION)

    def test_checksum_tamper_fails_before_activation(self):
        with tempfile.TemporaryDirectory() as folder:
            archive, stage = Path(folder) / 'x.tar.gz', Path(folder) / 'stage'
            stage.mkdir()
            make_archive(archive, hashes={'server.js': '0' * 64})
            files, _ = policy.inspect_archive(archive, REVISION)
            with self.assertRaises(policy.DeployError):
                policy.extract_archive(archive, stage, files)

    def test_revision_mismatch_is_rejected(self):
        with tempfile.TemporaryDirectory() as folder:
            archive = Path(folder) / 'x.tar.gz'
            make_archive(archive)
            with self.assertRaises(policy.DeployError):
                policy.inspect_archive(archive, 'b' * 40)

    def test_regular_extraction_only_adds_private_cache_link(self):
        with tempfile.TemporaryDirectory() as folder:
            archive, stage = Path(folder) / 'x.tar.gz', Path(folder) / 'stage'
            stage.mkdir()
            make_archive(archive)
            files, _ = policy.inspect_archive(archive, REVISION)
            policy.extract_archive(archive, stage, files)
            links = [x for x in stage.rglob('*') if x.is_symlink()]
            self.assertEqual(links, [stage / '.next/cache'])
            self.assertEqual(links[0].readlink(), policy.SHARED / 'next-cache')

    def test_packager_strips_builder_env(self):
        with tempfile.TemporaryDirectory() as folder:
            source = Path(folder) / 'source'
            source.mkdir()
            for name in policy.ROOT_REQUIRED | {'prisma/migrations/20260901000000_initial/migration.sql'}:
                path = source / name
                path.parent.mkdir(parents=True, exist_ok=True)
                path.write_bytes(b'fixture')
            (source / '.env.production').write_text('AUTH_SECRET=never-ship')
            archive = Path(folder) / 'x.tar.gz'
            packager.package(source, archive, REVISION)
            with tarfile.open(archive) as content:
                self.assertNotIn('.env.production', content.getnames())

    def test_packager_rejects_external_symlink(self):
        with tempfile.TemporaryDirectory() as folder:
            source = Path(folder) / 'source'
            source.mkdir()
            (source / 'server.js').symlink_to('/etc/passwd')
            with self.assertRaises(packager.policy.DeployError):
                packager.package(source, Path(folder) / 'x.tar.gz', REVISION)

    def test_packager_flattens_next_internal_dependency_aliases(self):
        with tempfile.TemporaryDirectory() as folder:
            source = Path(folder) / 'source'
            source.mkdir()
            for name in policy.ROOT_REQUIRED | {'prisma/migrations/20260901000000_initial/migration.sql'}:
                path = source / name
                path.parent.mkdir(parents=True, exist_ok=True)
                path.write_bytes(b'fixture')
            alias = source / '.next/node_modules/pg-generated-alias'
            alias.parent.mkdir(parents=True)
            alias.symlink_to('../../node_modules/pg')
            archive = Path(folder) / 'x.tar.gz'
            packager.package(source, archive, REVISION)
            with tarfile.open(archive) as content:
                self.assertIn('.next/node_modules/pg-generated-alias/package.json', content.getnames())
                self.assertTrue(all(member.isfile() for member in content))

    def test_receive_keeps_one_bounded_upload(self):
        with tempfile.TemporaryDirectory() as folder, mock.patch.object(policy, 'INCOMING', Path(folder)), mock.patch.object(policy, 'MAX_ARCHIVE', 4), mock.patch.object(policy, 'MIN_FREE_DISK', 0), mock.patch.object(policy, 'MAX_UNPACKED', 0):
            (Path(folder) / ('b' * 40 + '.tar.gz')).write_bytes(b'old')
            policy.receive(REVISION, io.BytesIO(b'1234'))
            self.assertEqual([x.name for x in Path(folder).iterdir()], [REVISION + '.tar.gz'])
            with self.assertRaises(policy.DeployError):
                policy.receive(REVISION, io.BytesIO(b'12345'))
            self.assertEqual(list(Path(folder).iterdir()), [])

    def test_receive_rejects_disk_floor_before_writing(self):
        with tempfile.TemporaryDirectory() as folder, mock.patch.object(policy, 'INCOMING', Path(folder)), mock.patch.object(policy.shutil, 'disk_usage', return_value=mock.Mock(free=0)):
            with self.assertRaises(policy.DeployError):
                policy.receive(REVISION, io.BytesIO(b'fixture'))
            self.assertEqual(list(Path(folder).iterdir()), [])

    def test_health_verifies_public_assets_and_next_static(self):
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder)
            (root / '.next/static').mkdir(parents=True)
            (root / 'public').mkdir()
            (root / '.next/static/app.js').write_bytes(b'next-js')
            (root / 'public/logo.svg').write_bytes(b'logo-svg')
            def response(path, direct=False):
                payloads = {'/api/health/live': {'status': 'ok'}, '/api/health/ready': {'status': 'ready'}, '/api/auth/session': None, '/api/auth/providers': {'credentials': {}}, '/api/auth/csrf': {'csrfToken': 'fixture'}}
                if path in payloads:
                    return 200, json.dumps(payloads[path]).encode()
                if path in {'/api/operations', '/api/projects'}:
                    return (401 if path == '/api/operations' else 400), b'{}'
                if path == '/_next/static/app.js':
                    return 200, b'next-js'
                if path == '/logo.svg':
                    return 200, b'logo-svg'
                return 200, b'html'
            with mock.patch.object(policy, 'request', side_effect=response) as request:
                policy.health(root)
                request.assert_any_call('/logo.svg')
                request.assert_any_call('/_next/static/app.js')
            with mock.patch.object(policy, 'request', side_effect=lambda path, direct=False: (200, b'wrong') if path == '/logo.svg' else response(path, direct)):
                with self.assertRaises(policy.DeployError):
                    policy.health(root)

    def test_uncommitted_recovery_restores_old_code(self):
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder)
            releases, incoming = root / 'releases', root / 'incoming'
            releases.mkdir(); incoming.mkdir()
            (releases / policy.LEGACY_RELEASE).mkdir()
            (releases / REVISION).mkdir()
            state = {'current': REVISION}
            def switch(value):
                state['current'] = value
            with mock.patch.object(policy, 'STATE', root), mock.patch.object(policy, 'RELEASES', releases), mock.patch.object(policy, 'INCOMING', incoming), mock.patch.object(policy, 'current_release', side_effect=lambda: state['current']), mock.patch.object(policy, 'switch_current', side_effect=switch), mock.patch.object(policy, 'restart_service') as restart, mock.patch.object(policy, 'wait_for_health') as health, mock.patch.object(policy.shutil.rmtree, 'avoids_symlink_attacks', True):
                policy.journal(policy.LEGACY_RELEASE, REVISION)
                policy.recover_transaction()
                self.assertEqual(state['current'], policy.LEGACY_RELEASE)
                restart.assert_called_once()
                health.assert_called_once_with(releases / policy.LEGACY_RELEASE)
                self.assertFalse((releases / REVISION).exists())
                self.assertFalse((root / 'transaction.json').exists())

    def test_committed_recovery_keeps_healthy_new_code_and_one_release(self):
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder)
            releases, incoming = root / 'releases', root / 'incoming'
            releases.mkdir(); incoming.mkdir()
            (releases / policy.LEGACY_RELEASE).mkdir()
            (releases / REVISION).mkdir()
            with mock.patch.object(policy, 'STATE', root), mock.patch.object(policy, 'RELEASES', releases), mock.patch.object(policy, 'INCOMING', incoming), mock.patch.object(policy, 'current_release', return_value=REVISION), mock.patch.object(policy, 'restart_service') as restart, mock.patch.object(policy, 'wait_for_health') as health, mock.patch.object(policy.shutil.rmtree, 'avoids_symlink_attacks', True):
                policy.journal(policy.LEGACY_RELEASE, REVISION, committed=True)
                policy.recover_transaction()
                restart.assert_not_called()
                health.assert_called_once_with(releases / REVISION)
                self.assertFalse((releases / policy.LEGACY_RELEASE).exists())
                self.assertTrue((releases / REVISION).is_dir())

    def test_failed_restart_rolls_back_code_and_preserves_business_data(self):
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder)
            releases, incoming, shared = root / 'releases', root / 'incoming', root / 'shared'
            releases.mkdir(); incoming.mkdir(); shared.mkdir()
            (shared / 'business-data').write_text('latest business data')
            old = policy.LEGACY_RELEASE
            (releases / old).mkdir()
            (releases / 'current').symlink_to(old)
            make_archive(incoming / (REVISION + '.tar.gz'))
            state = {'current': old}
            def switch(value):
                state['current'] = value
            with mock.patch.object(policy, 'RELEASES', releases), mock.patch.object(policy, 'STATE', root), mock.patch.object(policy, 'INCOMING', incoming), mock.patch.object(policy, 'SHARED', shared), mock.patch.object(policy, 'current_release', side_effect=lambda: state['current']), mock.patch.object(policy, 'switch_current', side_effect=switch), mock.patch.object(policy, 'restart_service', side_effect=[policy.DeployError('ledger rejects'), None]) as restart, mock.patch.object(policy, 'wait_for_health') as health, mock.patch.object(policy.shutil.rmtree, 'avoids_symlink_attacks', True), mock.patch.object(policy, 'MIN_FREE_DISK', 0):
                with self.assertRaises(policy.DeployError):
                    policy.publish(REVISION)
                self.assertEqual(state['current'], old)
                self.assertEqual(restart.call_count, 2)
                health.assert_called_once_with(releases / old)
            self.assertTrue((releases / old).is_dir())
            self.assertFalse((releases / REVISION).exists())
            self.assertEqual((shared / 'business-data').read_text(), 'latest business data')


if __name__ == '__main__':
    unittest.main()
