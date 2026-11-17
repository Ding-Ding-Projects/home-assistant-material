#!/bin/bash
#
# Self-contained tests for buildroot-external/rootfs-overlay/usr/libexec/haos-recovery.
#
# Runs without root and without touching any real device: the "stick" is an
# ordinary temporary directory, rauc and the restart command are fakes, and the
# mount commands are replaced by "true". Requires bash, jq and standard tools.
#
# Usage: operating-system/tests/recovery/test-haos-recovery.sh

here="$(cd "$(dirname "$0")" && pwd)"
SCRIPT="${here}/../../buildroot-external/rootfs-overlay/usr/libexec/haos-recovery"
WORK="$(mktemp -d)"
trap 'rm -rf "${WORK}"' EXIT

PASS=0
FAIL=0
SKIP=0

ok() { PASS=$((PASS + 1)); echo "  PASS  $1"; }
bad() { FAIL=$((FAIL + 1)); echo "  FAIL  $1"; }
skip() { SKIP=$((SKIP + 1)); echo "  SKIP  $1"; }

check() {
    # check <description> <command...>
    local desc="$1"
    shift
    if "$@"; then ok "${desc}"; else bad "${desc}"; fi
}

# new_env: fresh fake device. Sets T (case dir) and exports the overrides.
new_env() {
    T="${WORK}/case-$1"
    rm -rf "${T}"
    mkdir -p "${T}/stick" "${T}/boot" "${T}/data" "${T}/leds/ACT"
    : > "${T}/leds/ACT/brightness"
    echo "none [mmc0] heartbeat" > "${T}/leds/ACT/trigger"
    : > "${T}/dev-stick"
    echo "console=tty0 root=PARTUUID=abc rootwait" > "${T}/boot/cmdline.txt"
    {
        echo 'VARIANT_ID=rpi4-64'
        echo 'VERSION_ID=17.1'
    } > "${T}/os-release"
    echo "console=tty0 rauc.slot=A" > "${T}/proc-cmdline"
    cat > "${T}/fake-rauc" << 'EOF'
#!/bin/sh
case "$1" in
    status) exit 0 ;;
    install)
        echo "$2" >> "${FAKE_LOG_DIR}/rauc-install.log"
        exit "${FAKE_RAUC_RC:-0}"
        ;;
esac
exit 0
EOF
    chmod +x "${T}/fake-rauc"
    cat > "${T}/fake-reboot" << 'EOF'
#!/bin/sh
echo reboot >> "${FAKE_LOG_DIR}/reboot.log"
EOF
    chmod +x "${T}/fake-reboot"
    export FAKE_LOG_DIR="${T}"
    unset FAKE_RAUC_RC
    export RECOVERY_DEV="${T}/dev-stick" RECOVERY_DEV_TEST=-e
    export RECOVERY_MNT="${T}/stick" BOOT_DIR="${T}/boot" DATA_DIR="${T}/data"
    export OS_RELEASE="${T}/os-release" CMDLINE_FILE="${T}/proc-cmdline"
    export RAUC_BIN="${T}/fake-rauc" REBOOT_CMD="${T}/fake-reboot"
    export MOUNT_CMD=true UMOUNT_CMD=true MOUNTPOINT_CMD=true
    export LED_DIR="${T}/leds" LED_HOLD=0 RAUC_WAIT=0
    export NOW=20261116T130500Z
}

run_script() {
    # Always bounded; the script must always exit 0.
    timeout 60 sh "${SCRIPT}" > "${T}/out.txt" 2>&1
    RC=$?
}

write_request() {
    printf '%s' "$1" > "${T}/stick/recovery-request.json"
}

result() { cat "${T}/stick/recovery-result.txt" 2> /dev/null; }
rebooted() { [ -f "${T}/reboot.log" ] && wc -l < "${T}/reboot.log" | tr -d ' '; }
no_reboot() { [ ! -f "${T}/reboot.log" ]; }
no_rauc() { [ ! -f "${T}/rauc-install.log" ]; }
pending() { [ -f "${T}/stick/recovery-request.json" ]; }
has_marker() { [ -f "${T}/stick/recovery-request.$1-20261116T130500Z.json" ]; }
untouched_boot() { [ "$(cat "${T}/boot/cmdline.txt")" = "console=tty0 root=PARTUUID=abc rootwait" ]; }
no_trigger() { [ ! -e "${T}/data/docker/.wipe-scheduled" ]; }
result_mentions() { result | grep -q "$1"; }

# refused <name> <request json> <reason text>: nothing changes, request stays.
refused() {
    new_env "$1"
    write_request "$2"
    : > "${T}/stick/haos_rpi4-64-17.1.raucb"
    run_script
    check "$1: exits 0" [ "${RC}" -eq 0 ]
    check "$1: request stays pending" pending
    check "$1: no rauc, no reboot, no trigger, boot untouched" \
        bash -c "[ ! -f '${T}/rauc-install.log' ] && [ ! -f '${T}/reboot.log' ] && [ ! -e '${T}/data/docker/.wipe-scheduled' ] && [ \"\$(cat '${T}/boot/cmdline.txt')\" = 'console=tty0 root=PARTUUID=abc rootwait' ]"
    check "$1: reason in result file" result_mentions "$3"
}

echo "== haos-recovery tests =="

echo "-- inert and refused requests"
new_env no-request
run_script
check "no request file: exits 0" [ "${RC}" -eq 0 ]
check "no request file: no reboot, no rauc" bash -c "[ ! -f '${T}/reboot.log' ] && [ ! -f '${T}/rauc-install.log' ]"

refused malformed '{"format": 1, "action": ' "valid JSON\|not valid"
refused wrong-token '{"format":1,"action":"reset-apps","confirm":"reset-apps"}' "confirm phrase"
refused wrong-token-factory '{"format":1,"action":"factory-reset","confirm":"REINSTALL-OS"}' "confirm phrase"
refused unknown-action '{"format":1,"action":"format-disk","confirm":"X"}' "unknown action"
refused unknown-key '{"format":1,"action":"reset-apps","confirm":"RESET-APPS","extra":1}' "unknown key"
refused wrong-format '{"format":2,"action":"reset-apps","confirm":"RESET-APPS"}' "format must be"
refused bundle-with-reset '{"format":1,"action":"reset-apps","confirm":"RESET-APPS","bundle":"x"}' "only allowed for reinstall-os"
refused not-object '[1,2,3]' "not a JSON object"

# oversized
new_env oversized
{
    printf '{"format":1,"action":"reset-apps","confirm":"RESET-APPS","pad":"'
    head -c 5000 /dev/zero | tr '\0' 'a'
    printf '"}'
} > "${T}/stick/recovery-request.json"
run_script
check "oversized: exits 0, stays pending, no trigger" bash -c "[ ${RC} -eq 0 ] && [ -f '${T}/stick/recovery-request.json' ] && [ ! -e '${T}/data/docker/.wipe-scheduled' ]"
check "oversized: reason logged" result_mentions "larger than"

# symlink
new_env symlink
printf '%s' '{"format":1,"action":"reset-apps","confirm":"RESET-APPS"}' > "${T}/real.json"
if ln -s "${T}/real.json" "${T}/stick/recovery-request.json" 2> /dev/null && [ -L "${T}/stick/recovery-request.json" ]; then
    run_script
    check "symlink: exits 0 and nothing scheduled" bash -c "[ ${RC} -eq 0 ] && [ ! -e '${T}/data/docker/.wipe-scheduled' ]"
    check "symlink: reason logged" result_mentions "regular file"
else
    skip "symlink: this shell cannot create real symbolic links"
fi

# second request file
new_env second-request
write_request '{"format":1,"action":"reset-apps","confirm":"RESET-APPS"}'
cp "${T}/stick/recovery-request.json" "${T}/stick/recovery-request (1).json"
run_script
check "second request file: nothing scheduled, pending stays" bash -c "[ ${RC} -eq 0 ] && [ ! -e '${T}/data/docker/.wipe-scheduled' ] && [ -f '${T}/stick/recovery-request.json' ]"
check "second request file: reason logged" result_mentions "more than one request"

# already used markers
for state in started "done" failed; do
    new_env "used-${state}"
    printf '%s' '{"format":1,"action":"reset-apps","confirm":"RESET-APPS"}' > "${T}/stick/recovery-request.${state}-20250101T000000Z.json"
    write_request '{"format":1,"action":"reset-apps","confirm":"RESET-APPS"}'
    run_script
    check "already ${state}: not acted on" bash -c "[ ${RC} -eq 0 ] && [ ! -e '${T}/data/docker/.wipe-scheduled' ] && [ ! -f '${T}/reboot.log' ]"
done

echo "-- reinstall-os"
REQ_OS='{"format":1,"action":"reinstall-os","confirm":"REINSTALL-OS","bundle":"haos_rpi4-64-17.1.raucb"}'

new_env bundle-missing
write_request "${REQ_OS}"
run_script
check "missing bundle: refused, pending, no rauc" bash -c "[ ${RC} -eq 0 ] && [ -f '${T}/stick/recovery-request.json' ] && [ ! -f '${T}/rauc-install.log' ]"
check "missing bundle: reason logged" result_mentions "missing from the stick"

new_env wrong-board
write_request '{"format":1,"action":"reinstall-os","confirm":"REINSTALL-OS","bundle":"haos_rpi3-64-17.1.raucb"}'
: > "${T}/stick/haos_rpi3-64-17.1.raucb"
echo data > "${T}/stick/haos_rpi3-64-17.1.raucb"
run_script
check "wrong board: refused, no rauc, no reboot" bash -c "[ ${RC} -eq 0 ] && [ -f '${T}/stick/recovery-request.json' ] && [ ! -f '${T}/rauc-install.log' ] && [ ! -f '${T}/reboot.log' ]"
check "wrong board: reason logged" result_mentions "for board 'rpi3-64'"

new_env older-bundle
write_request '{"format":1,"action":"reinstall-os","confirm":"REINSTALL-OS","bundle":"haos_rpi4-64-17.0.raucb"}'
echo data > "${T}/stick/haos_rpi4-64-17.0.raucb"
run_script
check "older bundle: refused, no rauc" bash -c "[ ${RC} -eq 0 ] && [ -f '${T}/stick/recovery-request.json' ] && [ ! -f '${T}/rauc-install.log' ]"
check "older bundle: reason logged" result_mentions "older than the running"

new_env below-minimum
write_request '{"format":1,"action":"reinstall-os","confirm":"REINSTALL-OS","bundle":"haos_rpi4-64-17.1.raucb","minimum_version":"17.2"}'
echo data > "${T}/stick/haos_rpi4-64-17.1.raucb"
run_script
check "below minimum_version: refused, no rauc" bash -c "[ ${RC} -eq 0 ] && [ ! -f '${T}/rauc-install.log' ] && [ -f '${T}/stick/recovery-request.json' ]"

new_env bad-name
write_request '{"format":1,"action":"reinstall-os","confirm":"REINSTALL-OS","bundle":"../evil.raucb"}'
run_script
check "bad bundle name: refused, no rauc" bash -c "[ ${RC} -eq 0 ] && [ ! -f '${T}/rauc-install.log' ]"

new_env reinstall-ok
write_request "${REQ_OS}"
echo data > "${T}/stick/haos_rpi4-64-17.1.raucb"
run_script
check "reinstall: exits 0" [ "${RC}" -eq 0 ]
check "reinstall: rauc called with the stick path" \
    grep -qx "${T}/stick/haos_rpi4-64-17.1.raucb" "${T}/rauc-install.log"
check "reinstall: rauc called exactly once" bash -c "[ \$(wc -l < '${T}/rauc-install.log') -eq 1 ]"
check "reinstall: request renamed to done, original gone" bash -c "ls '${T}/stick' | grep -q '^recovery-request\.done-20261116T130500Z\.json\$' && [ ! -f '${T}/stick/recovery-request.json' ]"
check "reinstall: restart requested exactly once" [ "$(rebooted)" = "1" ]
check "reinstall: result file has time, board, version, slot" bash -c "grep -q '2026-11-16 13:05:00 UTC' '${T}/stick/recovery-result.txt' && grep -q 'board rpi4-64, OS version 17.1, system slot A' '${T}/stick/recovery-result.txt' && grep -q 'Result: done' '${T}/stick/recovery-result.txt'"
check "reinstall: LED trigger restored" bash -c "grep -q 'mmc0' '${T}/leds/ACT/trigger'"

# second run on the same stick
rm -f "${T}/reboot.log" "${T}/rauc-install.log"
run_script
check "second run on the same stick: nothing happens" bash -c "[ ${RC} -eq 0 ] && [ ! -f '${T}/rauc-install.log' ] && [ ! -f '${T}/reboot.log' ]"

new_env reinstall-newer-ok
write_request '{"format":1,"action":"reinstall-os","confirm":"REINSTALL-OS","bundle":"haos_rpi4-64-17.2.raucb","minimum_version":"17.1"}'
echo data > "${T}/stick/haos_rpi4-64-17.2.raucb"
run_script
check "newer bundle with minimum_version: installed" bash -c "[ -f '${T}/rauc-install.log' ] && [ \$(wc -l < '${T}/reboot.log') -eq 1 ]"

new_env rauc-fail
write_request "${REQ_OS}"
echo data > "${T}/stick/haos_rpi4-64-17.1.raucb"
export FAKE_RAUC_RC=1
run_script
check "rauc failure: exits 0" [ "${RC}" -eq 0 ]
check "rauc failure: request renamed to failed" has_marker failed
check "rauc failure: no restart" no_reboot
check "rauc failure: result says failed" result_mentions "FAILED"
unset FAKE_RAUC_RC

echo "-- reset-apps"
new_env reset-apps
mkdir -p "${T}/data/docker" "${T}/data/supervisor"
echo keep > "${T}/data/supervisor/config.json"
write_request '{"format":1,"action":"reset-apps","confirm":"RESET-APPS"}'
run_script
check "reset-apps: trigger created" [ -f "${T}/data/docker/.wipe-scheduled" ]
check "reset-apps: configuration kept" [ -f "${T}/data/supervisor/config.json" ]
check "reset-apps: request done, restart once" bash -c "ls '${T}/stick' | grep -q 'recovery-request.done-' && [ \$(wc -l < '${T}/reboot.log') -eq 1 ]"
check "reset-apps: result says configuration is kept" result_mentions "configuration are kept"
check "reset-apps: boot partition untouched" untouched_boot

new_env reset-apps-unmounted
write_request '{"format":1,"action":"reset-apps","confirm":"RESET-APPS"}'
export MOUNTPOINT_CMD=false
run_script
check "reset-apps without data partition: failed, no trigger, no restart" bash -c "[ ${RC} -eq 0 ] && [ ! -e '${T}/data/docker/.wipe-scheduled' ] && [ ! -f '${T}/reboot.log' ] && ls '${T}/stick' | grep -q 'recovery-request.failed-'"
export MOUNTPOINT_CMD=true

echo "-- factory-reset"
new_env factory-reset
write_request '{"format":1,"action":"factory-reset","confirm":"ERASE-EVERYTHING-ON-THIS-DEVICE"}'
run_script
check "factory-reset: erase flag appended to cmdline.txt" grep -q 'rootwait haos.wipe=1$' "${T}/boot/cmdline.txt"
check "factory-reset: cmdline still one line" bash -c "[ \$(wc -l < '${T}/boot/cmdline.txt') -eq 1 ]"
check "factory-reset: request done, restart once" bash -c "ls '${T}/stick' | grep -q 'recovery-request.done-' && [ \$(wc -l < '${T}/reboot.log') -eq 1 ]"
check "factory-reset: result says everything erased" result_mentions "EVERYTHING ON THIS DEVICE WILL BE ERASED"
check "factory-reset: no rauc call" no_rauc

new_env factory-reset-nocmdline
rm -f "${T}/boot/cmdline.txt"
write_request '{"format":1,"action":"factory-reset","confirm":"ERASE-EVERYTHING-ON-THIS-DEVICE"}'
run_script
check "factory-reset without cmdline.txt: failed, no restart" bash -c "ls '${T}/stick' | grep -q 'recovery-request.failed-' && [ ! -f '${T}/reboot.log' ]"

echo "-- hostile conditions"
new_env no-jq
write_request '{"format":1,"action":"reset-apps","confirm":"RESET-APPS"}'
JQ_BIN=/nonexistent/jq run_script
check "missing jq: exits 0, nothing done" bash -c "[ ${RC} -eq 0 ] && [ ! -e '${T}/data/docker/.wipe-scheduled' ] && [ -f '${T}/stick/recovery-request.json' ]"

new_env no-device
rm -f "${T}/dev-stick"
write_request '{"format":1,"action":"reset-apps","confirm":"RESET-APPS"}'
run_script
check "missing device: exits 0, nothing done" bash -c "[ ${RC} -eq 0 ] && [ ! -e '${T}/data/docker/.wipe-scheduled' ]"

new_env mount-fails
write_request '{"format":1,"action":"reset-apps","confirm":"RESET-APPS"}'
MOUNT_CMD=false run_script
check "mount failure: exits 0, nothing done" bash -c "[ ${RC} -eq 0 ] && [ ! -e '${T}/data/docker/.wipe-scheduled' ] && [ ! -f '${T}/reboot.log' ]"

echo
echo "Passed: ${PASS}  Failed: ${FAIL}  Skipped: ${SKIP}"
[ "${FAIL}" -eq 0 ]
