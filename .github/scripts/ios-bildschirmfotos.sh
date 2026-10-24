#!/usr/bin/env bash
# Bildschirmfotos der iOS-App im Simulator (Plan App Store, Pakete 2 und 10).
#
# Aufruf: ios-bildschirmfotos.sh <App.app aus dem Simulator-Build> <Zielordner>
#
# Je Geraet (iPhone 6,9 Zoll, iPad 13 Zoll), Darstellung (hell, dunkel) und
# Bildschirm (Eingabe, Uebersicht, Weg) ein Foto. Die App zeigt dabei die
# Beispielreise der Einfuehrungstour (Berlin Hbf, Gleis 14 -> 6) ohne Netz:
# Der Startpfad /vorfuehrung/<bildschirm> loest frontend/src/einfuehrung/
# vorfuehrstart.ts aus.
#
# Den Startpfad liest Capacitor aus capacitor.config.json im App-Paket
# (server.appStartPath). Er muss als Datei oder Ordner unter public/
# existieren, sonst bricht die App ab - deshalb der leere Ordner je Ziel.
# Der Simulator verlangt keine Signatur; das Paket darf veraendert werden.
set -euo pipefail

APP="$1"
ZIEL="$2"
BUNDLE_ID="online.umstieg.app"
mkdir -p "$ZIEL"

# Das neueste verfuegbare Geraet, dessen Name auf das Muster passt.
geraet() {
  xcrun simctl list devices available -j | jq -r --arg muster "$1" '
    [.devices | to_entries[] | select(.key | test("iOS")) | .key as $laufzeit
      | .value[] | select(.name | test($muster)) | {laufzeit: $laufzeit, udid}]
    | sort_by(.laufzeit) | last | .udid // empty'
}

fotografiere() {
  local name="$1" muster="$2"
  local udid
  udid="$(geraet "$muster")"
  if [ -z "$udid" ]; then
    echo "::error::Kein Simulator passt auf '$muster'"
    xcrun simctl list devices available
    exit 1
  fi
  echo "== $name: $(xcrun simctl list devices | grep "$udid")"

  xcrun simctl boot "$udid" || true
  xcrun simctl bootstatus "$udid" -b
  # Wie auf Apples eigenen Bildern: 9:41, volles Netz, voller Akku.
  xcrun simctl status_bar "$udid" override --time 9:41 --dataNetwork wifi \
    --wifiMode active --wifiBars 3 --cellularMode active --cellularBars 4 \
    --batteryState charged --batteryLevel 100
  # Berlin Hbf, damit eine Standortabfrage etwas Passendes findet.
  xcrun simctl location "$udid" set 52.5251,13.3694 || true

  for darstellung in light dark; do
    xcrun simctl ui "$udid" appearance "$darstellung"
    for bildschirm in eingabe uebersicht weg; do
      local paket="$RUNNER_TEMP/foto/App.app"
      rm -rf "$RUNNER_TEMP/foto" && mkdir -p "$RUNNER_TEMP/foto"
      cp -R "$APP" "$paket"
      mkdir -p "$paket/public/vorfuehrung/$bildschirm"
      local konfig="$paket/capacitor.config.json"
      jq --arg pfad "vorfuehrung/$bildschirm" '.server.appStartPath = $pfad' "$konfig" > "$konfig.neu"
      mv "$konfig.neu" "$konfig"

      xcrun simctl terminate "$udid" "$BUNDLE_ID" 2>/dev/null || true
      xcrun simctl install "$udid" "$paket"
      # Kein Systemdialog im Bild. Die App fragt heute beim Start (Paket 5
      # verschiebt das hinter einen erklaerenden Satz).
      xcrun simctl privacy "$udid" grant location "$BUNDLE_ID" || true
      xcrun simctl launch "$udid" "$BUNDLE_ID"
      # Start, Neuaufbau mit der Beispielreise und Seitenwechsel abwarten.
      sleep 12
      xcrun simctl io "$udid" screenshot "$ZIEL/$name-$darstellung-$bildschirm.png"
    done
  done

  xcrun simctl shutdown "$udid" || true
}

fotografiere iphone-6.9 'iPhone [0-9]+ Pro Max'
fotografiere ipad-13 'iPad Pro 13-inch'
ls -l "$ZIEL"
