#!/usr/bin/python3 -I
"""Read-only initial-install boundary inventory. This script changes nothing."""
import hashlib
import json
import os
from pathlib import Path
import stat

BASE = Path('/var/www/apixdoc')
SOURCE = BASE / 'releases/source-39'
PRIVATE = [Path('/etc/dogeow-tests/apixdoc.env.json'), BASE / 'shared']


def fingerprint(path):
    records = []
    def visit(item):
        info = item.lstat()
        row = [str(item.relative_to(path)), info.st_uid, info.st_gid, stat.S_IMODE(info.st_mode)]
        if stat.S_ISLNK(info.st_mode):
            row += ['link', os.readlink(item)]
        elif stat.S_ISREG(info.st_mode):
            row += ['file', hashlib.sha256(item.read_bytes()).hexdigest()]
        else:
            assert stat.S_ISDIR(info.st_mode)
            row += ['directory']
        records.append(row)
        if stat.S_ISDIR(info.st_mode):
            for child in sorted(item.iterdir()):
                visit(child)
    visit(path)
    return hashlib.sha256(json.dumps(records, separators=(',', ':')).encode()).hexdigest()


def code_entries():
    assert SOURCE.resolve() == SOURCE and SOURCE.is_dir()
    directories, files, links = [], [], []
    for directory, children, names in os.walk(SOURCE, followlinks=False):
        parent = Path(directory)
        assert parent.resolve().is_relative_to(SOURCE) and not parent.is_symlink() and not os.path.ismount(parent)
        directories.append(parent)
        for name in children + names:
            item = parent / name
            relative, info = item.relative_to(SOURCE).as_posix(), item.lstat()
            assert not name.startswith('.env') and name not in {'.git', '.ssh', '.npmrc', 'id_ed25519', 'id_rsa'}, 'Unexpected private file in code'
            if stat.S_ISLNK(info.st_mode):
                target = item.resolve(strict=True)
                assert target.is_relative_to(SOURCE) or (relative == '.next/cache' and target == BASE / 'shared/next-cache'), 'Unreviewed external code link'
                links.append(relative)
            elif stat.S_ISREG(info.st_mode):
                assert info.st_nlink == 1, 'Shared hardlinks require review'
                files.append(item)
            else:
                assert stat.S_ISDIR(info.st_mode)
    return directories, files, links


if __name__ == '__main__':
    assert os.geteuid() == 0
    assert os.readlink(BASE / 'current') == 'releases/source-39'
    directories, files, links = code_entries()
    print(json.dumps({'read_only': True, 'code_directories': len(directories), 'code_regular_files': len(files),
                      'code_regular_bytes': sum(x.stat().st_size for x in files), 'links_never_followed_for_chown': links,
                      'private_owner_mode_hash_fingerprints': {str(x): fingerprint(x) for x in PRIVATE}}, indent=2))
