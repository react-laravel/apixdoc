#!/usr/bin/python3 -I
"""Root-owned entry point; no shell, path argument, forwarding or SFTP."""
import os
import re
import sys


def parse_command(value):
    match = re.fullmatch(r'(receive|validate|publish) ([0-9a-f]{40})', value)
    if not match:
        raise ValueError('Only the fixed ApiXDoc receive/validate/publish command is allowed')
    return match.groups()


if __name__ == '__main__':
    try:
        command, revision = parse_command(os.environ.get('SSH_ORIGINAL_COMMAND', ''))
    except ValueError as error:
        print(str(error), file=sys.stderr)
        sys.exit(2)
    os.execv('/usr/local/libexec/publish-apixdoc', ['/usr/local/libexec/publish-apixdoc', command, revision])
