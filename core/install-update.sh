#!/bin/sh
set -eu
target_pid="$1"
application="$2"
staged="$3"
rollback="$4"
while kill -0 "$target_pid" 2>/dev/null; do sleep 1; done
next="${application}.next"
/usr/bin/ditto "$staged" "$next"
/usr/bin/codesign --verify --deep --strict "$next"
/bin/mv "$application" "$rollback"
if /bin/mv "$next" "$application"; then
  /usr/bin/open -a "$application"
else
  /bin/mv "$rollback" "$application"
  /usr/bin/open -a "$application"
  exit 1
fi
