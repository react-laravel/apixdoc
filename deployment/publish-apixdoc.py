#!/usr/bin/python3 -I
"""Non-root single-app publisher. Root installs this immutable helper."""
import fcntl
import hashlib
import http.client
import json
import os
from pathlib import Path, PurePosixPath
import pwd
import re
import shutil
import signal
import socket
import ssl
import stat
import subprocess
import sys
import tarfile
import tempfile
import time
from urllib.parse import quote

DEPLOY_USER = 'apixdoc-deploy'
APP_ROOT = Path('/var/www/apixdoc')
RELEASES = APP_ROOT / 'releases'
SHARED = APP_ROOT / 'shared'
STATE = Path('/var/lib/apixdoc-deploy/state')
INCOMING = STATE / 'incoming'
LEGACY_RELEASE = 'source-39'
UNIT = 'dogeow-test-apixdoc.service'
HOST = 'apixdoc.dogeow.com'
MAX_ARCHIVE = 96 * 1024 * 1024
MAX_UNPACKED = 192 * 1024 * 1024
MAX_MEMBER = 64 * 1024 * 1024
MIN_FREE_DISK = 1024 * 1024 * 1024
ROOT_FILES = {'server.js', 'package.json', 'package-lock.json'}
ROOT_REQUIRED = {'server.js', 'package.json', 'package-lock.json', '.next/BUILD_ID', '.next/routes-manifest.json', 'node_modules/next/package.json', 'node_modules/pg/package.json', 'node_modules/.prisma/client/default.js'}
PRIVATE_NAMES = {'.git', '.ssh', '.codex', '.npmrc', '.gitconfig', 'auth.json', 'id_rsa', 'id_ed25519'}


class DeployError(RuntimeError):
    pass


def require(condition, message):
    if not condition:
        raise DeployError(message)


def check_sha(revision):
    require(isinstance(revision, str) and re.fullmatch(r'[0-9a-f]{40}', revision), 'Invalid revision')
    return revision


def allowed_member(name):
    path = PurePosixPath(name)
    parts = path.parts
    require(name and not path.is_absolute() and name == path.as_posix() and all(x not in ('', '.', '..') for x in parts), 'Unsafe archive path')
    require(not any(x.startswith('.env') or x in PRIVATE_NAMES for x in parts), 'Private file in runtime')
    require(parts[0] in {'.next', 'node_modules', 'public'} or name in ROOT_FILES or
            (len(parts) == 4 and parts[:2] == ('prisma', 'migrations') and re.fullmatch(r'\d+_[a-z0-9_]+', parts[2]) and parts[3] == 'migration.sql') or
            name == 'prisma/migrations/migration_lock.toml', 'Unexpected runtime path')
    require(parts[:2] != ('.next', 'cache'), 'Cache must stay private on B')
    require(not name.endswith('.map'), 'Debug source maps are not needed on B')
    return path


def checked_directory(path, owner=None, immutable=False):
    info = path.lstat()
    require(stat.S_ISDIR(info.st_mode), 'Expected real directory')
    if owner is not None:
        require(info.st_uid == owner, 'Directory owner differs')
    if immutable:
        require(info.st_uid == 0 and not info.st_mode & 0o022, 'Protected directory is writable')


def inspect_archive(archive, revision):
    check_sha(revision)
    files, manifest, total = {}, None, 0
    with tarfile.open(archive, 'r:gz') as source:
        for member in source:
            require(len(files) < 100000 and member.isfile(), 'Only bounded regular files may be uploaded')
            require(0 <= member.size <= MAX_MEMBER and member.name not in files, 'Oversized or duplicate archive member')
            total += member.size
            require(total <= MAX_UNPACKED, 'Expanded runtime exceeds 192 MiB')
            if member.name == 'deploy-manifest.json':
                require(manifest is None and member.size <= 8 * 1024 * 1024, 'Invalid manifest size')
                manifest = json.loads(source.extractfile(member).read())
            else:
                allowed_member(member.name)
            files[member.name] = member.size
    require(isinstance(manifest, dict) and manifest.get('schema') == 1 and manifest.get('revision') == revision, 'Manifest revision differs')
    expected = manifest.get('files')
    require(isinstance(expected, dict) and set(expected) == set(files) - {'deploy-manifest.json'}, 'Manifest membership differs')
    require(ROOT_REQUIRED <= set(expected), 'Missing Next/Prisma/pg runtime dependency')
    require(any(x.startswith('prisma/migrations/') and x.endswith('/migration.sql') for x in expected), 'Missing migration checksum metadata')
    for digest in expected.values():
        require(isinstance(digest, str) and re.fullmatch(r'[0-9a-f]{64}', digest), 'Invalid file checksum')
    return expected, total


def extract_archive(archive, stage, expected):
    with tarfile.open(archive, 'r:gz') as source:
        copied_names = set()
        for member in source:
            if member.name == 'deploy-manifest.json':
                continue
            require(member.isfile() and member.name in expected and member.name not in copied_names, 'Archive changed after inspection')
            target = stage.joinpath(*allowed_member(member.name).parts)
            require(shutil.disk_usage(stage).free >= member.size + 65536 + MIN_FREE_DISK, 'File extraction would cross the 1 GiB disk floor')
            target.parent.mkdir(mode=0o755, parents=True, exist_ok=True)
            fd = os.open(target, os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW, 0o644)
            digest, size = hashlib.sha256(), 0
            with source.extractfile(member) as origin, os.fdopen(fd, 'wb') as destination:
                while part := origin.read(1024 * 1024):
                    size += len(part)
                    require(size <= member.size and size <= MAX_MEMBER, 'Archive member grew')
                    digest.update(part)
                    destination.write(part)
                os.fchmod(destination.fileno(), 0o644)
            require(size == member.size and digest.hexdigest() == expected[member.name], 'Runtime checksum differs')
            copied_names.add(member.name)
        require(copied_names == set(expected), 'Runtime membership changed')
    (stage / '.next/cache').symlink_to(SHARED / 'next-cache')
    for directory, _, _ in os.walk(stage, followlinks=False):
        os.chmod(directory, 0o755)


def current_release():
    require((APP_ROOT / 'current').is_symlink() and os.readlink(APP_ROOT / 'current') == 'releases/current', 'Root current link changed')
    link = RELEASES / 'current'
    require(link.is_symlink(), 'Managed current link missing')
    value = os.readlink(link)
    require(value == LEGACY_RELEASE or re.fullmatch(r'[0-9a-f]{40}', value), 'Unexpected current target')
    checked_directory(RELEASES / value, owner=os.geteuid())
    return value


def switch_current(value):
    require(value == LEGACY_RELEASE or re.fullmatch(r'[0-9a-f]{40}', value), 'Unsafe activation target')
    temporary = RELEASES / ('.current-' + str(os.getpid()))
    require(not os.path.lexists(temporary), 'Activation path already exists')
    temporary.symlink_to(value)
    try:
        os.replace(temporary, RELEASES / 'current')
    finally:
        if temporary.is_symlink():
            temporary.unlink()


def restart_service():
    result = subprocess.run(['/usr/bin/sudo', '-n', '/usr/bin/systemctl', 'restart', UNIT],
                            env={'PATH': '/usr/bin:/bin', 'LANG': 'C.UTF-8'},
                            stdout=subprocess.PIPE, stderr=subprocess.PIPE, timeout=90)
    require(result.returncode == 0, 'ApiXDoc restart or application-UID ledger check failed; private output suppressed')


class LocalHTTPS(http.client.HTTPSConnection):
    def connect(self):
        raw = socket.create_connection(('127.0.0.1', 443), timeout=8)
        self.sock = self._context.wrap_socket(raw, server_hostname=self.host)


def request(path, direct=False):
    connection = http.client.HTTPConnection('127.0.0.1', 3002, timeout=8) if direct else LocalHTTPS(HOST, timeout=8, context=ssl.create_default_context())
    try:
        connection.request('GET', path, headers={'Host': HOST, 'Accept-Encoding': 'identity'})
        response = connection.getresponse()
        content = response.read(16 * 1024 * 1024 + 1)
        require(len(content) <= 16 * 1024 * 1024, 'Oversized health response')
        return response.status, content
    finally:
        connection.close()


def health(release):
    routes = {'/': 200, '/login': 200, '/api/auth/providers': 200, '/api/auth/session': 200,
              '/api/auth/csrf': 200, '/api/operations': 401, '/api/projects': 400,
              '/api/health/live': 200, '/api/health/ready': 200}
    for direct in (True, False):
        for route, status in routes.items():
            actual, body = request(route, direct)
            require(actual == status, 'ApiXDoc anonymous route contract failed')
            if route == '/api/health/live':
                require(json.loads(body) == {'status': 'ok'}, 'Liveness contract differs')
            elif route == '/api/health/ready':
                require(json.loads(body) == {'status': 'ready'}, 'Prisma readiness failed')
            elif route == '/api/auth/session':
                require(json.loads(body) is None, 'Anonymous session contract differs')
            elif route == '/api/auth/providers':
                require(set(json.loads(body)) == {'credentials'}, 'Credentials provider differs')
            elif route == '/api/auth/csrf':
                require(isinstance(json.loads(body).get('csrfToken'), str), 'CSRF contract differs')
    roots = [(release / '.next/static', '/_next/static/'), (release / 'public', '/')]
    resources = [(item, root, prefix) for root, prefix in roots for item in sorted(root.rglob('*')) if item.is_file()]
    require(resources, 'No Next static resources')
    for resource, root, prefix in resources:
        require(not resource.is_symlink(), 'Static resources must be regular files')
        url = prefix + quote(resource.relative_to(root).as_posix(), safe='/')
        status, body = request(url)
        require(status == 200 and hashlib.sha256(body).digest() == hashlib.sha256(resource.read_bytes()).digest(), 'Static resource content differs')


def wait_for_health(release):
    for attempt in range(8):
        try:
            health(release)
            return
        except (DeployError, OSError, ValueError, http.client.HTTPException):
            if attempt == 7:
                raise DeployError('ApiXDoc health check failed after restart') from None
            time.sleep(1)


def remove_release(name):
    require(name == LEGACY_RELEASE or re.fullmatch(r'[0-9a-f]{40}', name), 'Unsafe cleanup target')
    checked_directory(RELEASES / name, owner=os.geteuid())
    require(shutil.rmtree.avoids_symlink_attacks, 'Safe cleanup is unavailable')
    shutil.rmtree(RELEASES / name)


def archive_for(revision):
    target = INCOMING / (check_sha(revision) + '.tar.gz')
    info = target.lstat()
    require(stat.S_ISREG(info.st_mode) and info.st_uid == os.geteuid() and 0 < info.st_size <= MAX_ARCHIVE and info.st_nlink == 1, 'Invalid incoming archive')
    return target


def journal(previous, candidate, committed=False):
    temporary = STATE / 'transaction.next'
    if os.path.lexists(temporary):
        info = temporary.lstat()
        require(stat.S_ISREG(info.st_mode) and info.st_uid == os.geteuid() and info.st_nlink == 1 and info.st_size < 1024, 'Unsafe stale recovery journal')
        temporary.unlink()
    fd = os.open(temporary, os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW, 0o600)
    try:
        with os.fdopen(fd, 'w') as output:
            json.dump({'previous': previous, 'candidate': candidate, 'committed': committed}, output)
            output.flush()
            os.fsync(output.fileno())
        os.replace(temporary, STATE / 'transaction.json')
        directory = os.open(STATE, os.O_RDONLY | os.O_DIRECTORY)
        try:
            os.fsync(directory)
        finally:
            os.close(directory)
    finally:
        temporary.unlink(missing_ok=True)


def recover_transaction():
    target = STATE / 'transaction.json'
    if not target.exists():
        return
    info = target.lstat()
    require(stat.S_ISREG(info.st_mode) and info.st_uid == os.geteuid() and info.st_size < 1024, 'Invalid recovery journal')
    data = json.loads(target.read_text())
    old, candidate = data['previous'], data['candidate']
    require(old == LEGACY_RELEASE or re.fullmatch(r'[0-9a-f]{40}', old), 'Invalid previous recovery target')
    check_sha(candidate)
    require(old != candidate and isinstance(data.get('committed'), bool), 'Invalid recovery state')
    active = current_release()
    require(active in {old, candidate}, 'Recovery journal does not match current code')
    if data['committed']:
        require(active == candidate, 'Committed release is no longer active')
        wait_for_health(RELEASES / candidate)
        if (RELEASES / old).exists():
            remove_release(old)
    else:
        if active != old:
            switch_current(old)
        restart_service()
        wait_for_health(RELEASES / old)
        if (RELEASES / candidate).exists():
            remove_release(candidate)
    for stage in RELEASES.glob('.prepare-' + candidate + '-*'):
        checked_directory(stage, owner=os.geteuid())
        require(shutil.rmtree.avoids_symlink_attacks, 'Safe cleanup is unavailable')
        shutil.rmtree(stage)
    (INCOMING / (candidate + '.tar.gz')).unlink(missing_ok=True)
    (STATE / 'transaction.next').unlink(missing_ok=True)
    target.unlink()


def publish(revision):
    archive = archive_for(revision)
    old = current_release()
    require(old != revision, 'Revision is already active')
    require({x.name for x in RELEASES.iterdir()} == {old, 'current'}, 'Unexpected existing release or incomplete transaction')
    expected, expanded = inspect_archive(archive, revision)
    require(shutil.disk_usage(RELEASES).free >= expanded + MIN_FREE_DISK, 'Extraction would leave less than 1 GiB free')
    journal(old, revision)
    stage = Path(tempfile.mkdtemp(prefix='.prepare-' + revision + '-', dir=RELEASES))
    final = RELEASES / revision
    activated, accepted = False, False
    try:
        extract_archive(archive, stage, expected)
        require(shutil.disk_usage(RELEASES).free >= MIN_FREE_DISK, 'Runtime extraction crossed the disk floor')
        os.rename(stage, final)
        switch_current(revision)
        activated = True
        restart_service()
        wait_for_health(final)
        journal(old, revision, committed=True)
        accepted = True
        remove_release(old)
        (STATE / 'transaction.json').unlink()
        print(json.dumps({'published': revision, 'healthy': True, 'retained_releases': 1, 'database_migrated': False}))
    except BaseException:
        if activated and not accepted:
            switch_current(old)
            restart_service()
            wait_for_health(RELEASES / old)
            (STATE / 'transaction.json').unlink(missing_ok=True)
        raise
    finally:
        if stage.exists():
            shutil.rmtree(stage)
        if not accepted and final.exists() and current_release() != revision:
            remove_release(revision)
        archive.unlink(missing_ok=True)


def receive(revision, origin):
    for previous in INCOMING.iterdir():
        info = previous.lstat()
        require(re.fullmatch(r'[0-9a-f]{40}\.tar\.gz', previous.name) and stat.S_ISREG(info.st_mode) and info.st_uid == os.geteuid(), 'Unknown incoming file')
        previous.unlink()
    require(shutil.disk_usage(INCOMING).free >= MAX_ARCHIVE + MAX_UNPACKED + MIN_FREE_DISK, 'Upload and extraction must preserve 1 GiB free')
    target = INCOMING / (check_sha(revision) + '.tar.gz')
    fd = os.open(target, os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW, 0o600)
    try:
        total = 0
        with os.fdopen(fd, 'wb') as destination:
            while part := origin.read(1024 * 1024):
                total += len(part)
                require(total <= MAX_ARCHIVE, 'Archive exceeds 96 MiB')
                destination.write(part)
            require(total > 0, 'Empty upload')
        print(json.dumps({'received': revision, 'compressed_bytes': total}))
    except BaseException:
        target.unlink(missing_ok=True)
        raise


def main(arguments):
    os.umask(0o027)
    require(os.geteuid() != 0 and os.geteuid() == pwd.getpwnam(DEPLOY_USER).pw_uid, 'Only the fixed deploy account may run this helper')
    require(len(arguments) == 2 and arguments[0] in {'receive', 'validate', 'publish'}, 'Invalid command')
    command, revision = arguments
    check_sha(revision)
    checked_directory(APP_ROOT, immutable=True)
    checked_directory(RELEASES, owner=os.geteuid())
    checked_directory(STATE, owner=os.geteuid())
    checked_directory(INCOMING, owner=os.geteuid())
    fd = os.open(STATE / 'publish.lock', os.O_WRONLY | os.O_CREAT | os.O_NOFOLLOW, 0o600)
    with os.fdopen(fd, 'wb') as lock:
        fcntl.flock(lock, fcntl.LOCK_EX)
        # A closed SSH connection must not abandon activation halfway through.
        signal.signal(signal.SIGHUP, signal.SIG_IGN)
        signal.signal(signal.SIGTERM, lambda *_: (_ for _ in ()).throw(DeployError('Interrupted deployment')))
        recover_transaction()
        if command == 'receive':
            receive(revision, sys.stdin.buffer)
        elif command == 'validate':
            archive = archive_for(revision)
            expected, expanded = inspect_archive(archive, revision)
            require(shutil.disk_usage(RELEASES).free >= expanded + MIN_FREE_DISK, 'Validation would leave less than 1 GiB free')
            print(json.dumps({'validated': revision, 'files': len(expected), 'expanded_bytes': expanded, 'current_changed': False}))
        else:
            publish(revision)


if __name__ == '__main__':
    try:
        main(sys.argv[1:])
    except (DeployError, OSError, ValueError, tarfile.TarError, subprocess.SubprocessError):
        print('ApiXDoc deployment rejected; current code and business data were preserved or rollback was attempted', file=sys.stderr)
        sys.exit(1)
