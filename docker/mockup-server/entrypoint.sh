#!/bin/sh
# The data is the volume (the host folder behind /data), not a copy in the image. An empty Datasource is only said, never filled from here:
# put the documents there with `npm run mockup:seed` (through the https address) or by hand.
set -e
if [ -z "$(ls -A "$MOCKUP_DATASOURCE" 2>/dev/null)" ]; then
  echo "Datasource: the volume is empty - run 'npm run mockup:seed' from a developer machine to fill it"
fi
exec "$@"
