#!/usr/bin/env python3
"""Package only the standalone runtime. No .env, development tree or symlinks."""
import hashlib
import importlib.util
import io
import json
from pathlib import Path
import sys
import tarfile

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location('apixdoc_publisher', ROOT / 'deployment/publish-apixdoc.py')
policy = importlib.util.module_from_spec(spec)
spec.loader.exec_module(policy)


def package(standalone, output, revision):
    policy.check_sha(revision)
    standalone = standalone.resolve(strict=True)
    files = {}
    def visit(directory, ancestors):
        resolved = directory.resolve(strict=True)
        policy.require(resolved.is_relative_to(standalone) and resolved not in ancestors, 'External or cyclic runtime link')
        for source in sorted(directory.iterdir()):
            name = source.relative_to(standalone).as_posix()
            # Next standalone can copy .env files from the builder. Never upload them.
            if any(x.startswith('.env') for x in source.relative_to(standalone).parts) or name.endswith('.map'):
                continue
            if source.is_symlink():
                policy.require(source.resolve(strict=True).is_relative_to(standalone), 'External runtime link')
            if source.is_dir():
                # Turbopack emits internal dependency aliases. Flatten their regular
                # file contents so B never extracts archive links or follows them.
                visit(source, ancestors | {resolved})
                continue
            policy.require(source.is_file(), 'Special runtime file')
            policy.allowed_member(name)
            files[name] = hashlib.sha256(source.read_bytes()).hexdigest()
    visit(standalone, set())
    policy.require(policy.ROOT_REQUIRED <= set(files), 'Incomplete runtime')
    manifest = json.dumps({'schema': 1, 'revision': revision, 'files': files}, sort_keys=True).encode()
    output = Path(output)
    policy.require(not output.exists(), 'Archive already exists')
    try:
        with tarfile.open(output, 'w:gz') as archive:
            for name in files:
                content = (standalone / name).read_bytes()
                member = tarfile.TarInfo(name)
                member.size, member.mode, member.mtime = len(content), 0o644, 0
                archive.addfile(member, io.BytesIO(content))
            member = tarfile.TarInfo('deploy-manifest.json')
            member.size, member.mode, member.mtime = len(manifest), 0o644, 0
            archive.addfile(member, io.BytesIO(manifest))
        policy.require(output.stat().st_size <= policy.MAX_ARCHIVE, 'Compressed runtime exceeds 96 MiB')
        expected, expanded = policy.inspect_archive(output, revision)
        print(json.dumps({'revision': revision, 'files': len(expected), 'compressed_bytes': output.stat().st_size, 'expanded_bytes': expanded, 'sha256': hashlib.sha256(output.read_bytes()).hexdigest()}))
    except BaseException:
        output.unlink(missing_ok=True)
        raise


if __name__ == '__main__':
    policy.require(len(sys.argv) == 3, 'Usage: package-apixdoc.py OUTPUT SHA')
    package(ROOT / '.next/standalone', sys.argv[1], sys.argv[2])
