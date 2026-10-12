#!/bin/sh
# Startskript des Backend-Containers (Spec 2026-10-12, Abschnitt 8).
#
# Fly haengt das Volume als root ein; der Server laeuft aber bewusst nicht als
# root. Deshalb: als root den Ablageordner anlegen und an `node` uebergeben,
# dann den Server per su-exec als `node` starten.
set -e
if [ -n "$OSM_VOLUME_PFAD" ]; then
  mkdir -p "$OSM_VOLUME_PFAD"
  chown -R node:node "$OSM_VOLUME_PFAD"
fi
exec su-exec node "$@"
