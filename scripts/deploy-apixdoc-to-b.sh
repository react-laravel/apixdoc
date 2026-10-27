#!/usr/bin/env bash
set -euo pipefail
archive=${1:?runtime archive required}
revision=${2:?revision required}
[[ "$revision" =~ ^[0-9a-f]{40}$ ]] || exit 2
[[ -f "$archive" && ! -L "$archive" ]] || exit 2
: "${B_APIXDOC_DEPLOY_SSH_KEY:?missing scoped deploy key}"
: "${B_APIXDOC_DEPLOY_KNOWN_HOSTS:?missing pinned B host key}"
temporary=$(mktemp -d)
trap 'rm -rf -- "$temporary"' EXIT
chmod 700 "$temporary"
printf '%s\n' "$B_APIXDOC_DEPLOY_SSH_KEY" > "$temporary/key"
printf '%s\n' "$B_APIXDOC_DEPLOY_KNOWN_HOSTS" > "$temporary/known_hosts"
chmod 600 "$temporary/key" "$temporary/known_hosts"
unset B_APIXDOC_DEPLOY_SSH_KEY B_APIXDOC_DEPLOY_KNOWN_HOSTS
remote=(ssh -T -F /dev/null -o BatchMode=yes -o IdentitiesOnly=yes -o StrictHostKeyChecking=yes -o ConnectTimeout=15 -o ServerAliveInterval=10 -o ServerAliveCountMax=3 -o "UserKnownHostsFile=$temporary/known_hosts" -i "$temporary/key" apixdoc-deploy@154.21.197.138)
"${remote[@]}" "receive $revision" < "$archive"
"${remote[@]}" "validate $revision"
"${remote[@]}" "publish $revision"
