#!/bin/sh
# What upstream has that this fork does not, and what the fork carries on top.
# Run at the start of every new deck to decide whether to rebase.
set -eu
cd "$(dirname "$0")/.."

git fetch -q upstream --tags
base=$(git merge-base HEAD upstream/main)

echo "Fork base:        $(git describe --tags --always "$base") ($(git log -1 --format=%cs "$base"))"
echo "Upstream main:    $(git describe --tags --always upstream/main) ($(git log -1 --format=%cs upstream/main))"
echo
echo "Upstream releases:"
gh release list -R vsitzmann/deckwerk --limit 3 2>/dev/null | sed 's/^/  /' || echo "  (gh unavailable)"
echo
echo "Upstream commits since the fork base:"
if [ -n "$(git rev-list "$base"..upstream/main)" ]; then
  git log --oneline --no-merges "$base"..upstream/main | sed 's/^/  /'
else
  echo "  (none: nothing to rebase onto)"
fi
echo
echo "Fork commits on top of upstream:"
git log --oneline upstream/main..HEAD | sed 's/^/  /'
echo
echo "Fork PRs to upstream:"
gh pr list -R vsitzmann/deckwerk --author @me --state all --json number,title,state \
  --jq '.[] | "  #\(.number) [\(.state)] \(.title)"' 2>/dev/null || echo "  (gh unavailable)"
