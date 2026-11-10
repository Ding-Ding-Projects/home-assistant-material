#!/usr/bin/env bash
# Vendors the Google Sans Flex typeface (SIL Open Font License 1.1) into the frontend so the
# interface never loads fonts from the internet. Downloads the Latin, Latin Extended and
# Vietnamese subsets of the variable font (weights 400 to 700), writes their SHA-256 values
# to a manifest, and stores the licence text beside them. Run again to refresh.
set -euo pipefail
cd "$(dirname "$0")/.."
dest="frontend/public/static/fonts/google-sans-flex"
css_url="https://fonts.googleapis.com/css2?family=Google+Sans+Flex:wght@400..700&display=swap"
agent="Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36"
mkdir -p "${dest}"
css="$(curl -fsS -A "${agent}" "${css_url}")"
for subset in latin latin-ext vietnamese; do
  url="$(printf '%s\n' "${css}" | awk -v s="/* ${subset} */" '$0==s{f=1} f && /src: url\(/{sub(/.*url\(/,""); sub(/\).*/,""); print; exit}')"
  if [ -z "${url}" ]; then echo "No ${subset} subset found" >&2; exit 1; fi
  curl -fsS -o "${dest}/GoogleSansFlex-${subset}.woff2" "${url}"
done
curl -fsS -o "${dest}/OFL.txt" https://raw.githubusercontent.com/googlefonts/googlesans-flex/main/OFL.txt
( cd "${dest}" && sha256sum GoogleSansFlex-*.woff2 OFL.txt > SHA256SUMS )
cat "${dest}/SHA256SUMS"
