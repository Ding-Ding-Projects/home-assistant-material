#!/bin/bash
# shellcheck disable=SC1090,SC1091
set -e

SCRIPT_DIR=${BR2_EXTERNAL_HAOS_PATH}/scripts
BOARD_DIR=${2}

. "${BR2_EXTERNAL_HAOS_PATH}/meta"
. "${BOARD_DIR}/meta"

. "${SCRIPT_DIR}/rootfs-layer.sh"
. "${SCRIPT_DIR}/name.sh"
. "${SCRIPT_DIR}/rauc.sh"

# Two mount units need a backslash in their file names (systemd writes a dash
# inside a path component as \x2d). Windows cannot create such a name, so the
# repository stores them with __x2d__ in its place and the real names are put
# back here, before systemd reads the unit files.
escaped_dash='\x2d'
for unit in "${TARGET_DIR}"/usr/lib/systemd/system/*__x2d__*; do
    [ -e "${unit}" ] || continue
    mv -f "${unit}" "${unit%%__x2d__*}${escaped_dash}${unit#*__x2d__}"
done

# HAOS tasks
fix_rootfs
install_tini_docker
setup_localtime
setup_vconsole

# Write os-release
# shellcheck disable=SC2153
(
    echo "NAME=\"${HAOS_NAME}\""
    echo "VERSION=\"$(haos_version) (${BOARD_NAME})\""
    echo "ID=${HAOS_ID}"
    echo "VERSION_ID=$(haos_version)"
    echo "PRETTY_NAME=\"${HAOS_NAME} $(haos_version)\""
    echo "CPE_NAME=cpe:2.3:o:home-assistant:${HAOS_ID}:$(haos_version):*:${DEPLOYMENT}:*:*:*:${BOARD_ID}:*"
    echo "HOME_URL=https://www.home-assistant.io/"
    echo "VARIANT=\"${HAOS_NAME} ${BOARD_NAME}\""
    echo "VARIANT_ID=${BOARD_ID}"
    echo "SUPERVISOR_MACHINE=${SUPERVISOR_MACHINE}"
    echo "SUPERVISOR_ARCH=${SUPERVISOR_ARCH}"
) > "${TARGET_DIR}/usr/lib/os-release"

# Write machine-info
(
    echo "CHASSIS=${CHASSIS}"
    echo "DEPLOYMENT=${DEPLOYMENT}"
) > "${TARGET_DIR}/etc/machine-info"


# Setup RAUC
prepare_rauc_signing
write_rauc_config
install_rauc_certs
install_bootloader_config

# Fix overlay presets
"${HOST_DIR}/bin/systemctl" --root="${TARGET_DIR}" preset-all
