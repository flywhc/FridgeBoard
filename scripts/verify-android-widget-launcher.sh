#!/usr/bin/env bash
set -euo pipefail

# The widget must already be installed, configured with the audit fixture, and resized to the 4x2 default.
# This script only drives the real Launcher and leaves the app data untouched.

DEVICE="${ANDROID_SERIAL:-emulator-5554}"
PACKAGE="com.fridgeboard.app"
OUT_DIR="${1:-artifacts/android-widget-launcher-$(date +%Y%m%d-%H%M%S)}"
mkdir -p "$OUT_DIR"

ADB=(adb -s "$DEVICE")
EXPECTED=("番茄炒蛋" "香菇鸡丁" "清蒸鲈鱼" "扬州炒饭" "土豆炖牛腩" "西红柿面" "紫菜蛋花汤")

dump_ui() {
    local label="$1"
    "${ADB[@]}" shell uiautomator dump "/sdcard/fbw-${label}.xml" >/dev/null
    "${ADB[@]}" exec-out cat "/sdcard/fbw-${label}.xml" > "$OUT_DIR/ui-${label}.xml"
}

ui_assert_list() {
    local label="$1"
    python3 - "$OUT_DIR/ui-${label}.xml" "$PACKAGE" "${2:-}" <<'PY'
import sys
import xml.etree.ElementTree as ET

path, package, required = sys.argv[1:]
nodes = [node for node in ET.parse(path).getroot().iter()
         if node.attrib.get("package") == package]
if any("widget_page_dot" in node.attrib.get("resource-id", "") for node in nodes):
    raise SystemExit(f"{path}: obsolete page dots are visible")
lists = [node for node in nodes
         if node.attrib.get("resource-id", "").endswith("widget_page_stack")]
if len(lists) != 1 or lists[0].attrib.get("class") != "android.widget.ListView":
    raise SystemExit(f"{path}: expected one native ListView")
names = [node.attrib.get("text", "") for node in nodes
         if node.attrib.get("resource-id", "").endswith("widget_row_recipe")]
expected = ["番茄炒蛋", "香菇鸡丁", "清蒸鲈鱼", "扬州炒饭", "土豆炖牛腩", "西红柿面", "紫菜蛋花汤"]
indices = [next((i for i, dish in enumerate(expected) if name.startswith(dish)), -1)
           for name in names]
if not indices or -1 in indices or indices != list(range(indices[0], indices[0] + len(indices))):
    raise SystemExit(f"{path}: unexpected list order {names!r}")
if required and not any(name.startswith(required) for name in names):
    raise SystemExit(f"{path}: required recipe not visible: {required}")
print(f"{path}: native list, no dots, recipes={names}")
PY
}

widget_bounds() {
    local xml="$1"
    python3 - "$xml" "$PACKAGE" <<'PY'
import re
import sys
import xml.etree.ElementTree as ET

root = ET.parse(sys.argv[1]).getroot()
package = sys.argv[2]
for node in root.iter():
    resource = node.attrib.get("resource-id", "")
    if resource.endswith("widget_root") and node.attrib.get("package") == package:
        match = re.fullmatch(r"\[(\d+),(\d+)\]\[(\d+),(\d+)\]", node.attrib.get("bounds", ""))
        if match:
            print(*match.groups())
            break
else:
    raise SystemExit("FridgeBoard widget_root bounds not found")
PY
}

swipe_list() {
    local direction="${1:-up}"
    dump_ui current-swipe
    python3 - "$OUT_DIR/ui-current-swipe.xml" "$PACKAGE" <<'PY' | while read -r x y1 y2; do
import re
import sys
import xml.etree.ElementTree as ET

for node in ET.parse(sys.argv[1]).getroot().iter():
    if (node.attrib.get("package") == sys.argv[2]
            and node.attrib.get("resource-id", "").endswith("widget_page_stack")):
        values = list(map(int, re.findall(r"\d+", node.attrib.get("bounds", ""))))
        if len(values) != 4:
            raise SystemExit("invalid widget_page_stack bounds")
        x1, top, x2, bottom = values
        inset = max(8, (bottom - top) // 5)
        print((x1 + x2) // 2, bottom - inset, top + inset)
        break
else:
    raise SystemExit("widget_page_stack not found")
PY
        if [[ "$direction" == down ]]; then
            "${ADB[@]}" shell input swipe "$x" "$y2" "$x" "$y1" 400
        else
            "${ADB[@]}" shell input swipe "$x" "$y1" "$x" "$y2" 400
        fi
    done
    sleep 2
}

capture_widget() {
    local label="$1"
    local xml="$OUT_DIR/ui-${label}.xml"
    local bounds
    bounds="$(widget_bounds "$xml")"
    read -r x1 y1 x2 y2 <<< "$bounds"
    local width=$((x2 - x1))
    local height=$((y2 - y1))
    if (( width <= 0 || height <= 0 )); then
        echo "invalid widget bounds: $bounds" >&2
        exit 1
    fi
    "${ADB[@]}" exec-out screencap -p > "$OUT_DIR/full-${label}.png"
    sips --cropToHeightWidth "$height" "$width" \
        --cropOffset "$y1" "$x1" "$OUT_DIR/full-${label}.png" \
        --out "$OUT_DIR/widget-${label}.png" >/dev/null
    printf '%s %s %s %s %s %s\n' "$x1" "$y1" "$x2" "$y2" "$width" "$height" \
        > "$OUT_DIR/bounds-${label}.txt"
}

if ! "${ADB[@]}" get-state >/dev/null 2>&1; then
    echo "adb device is unavailable: $DEVICE" >&2
    exit 1
fi
if ! "${ADB[@]}" shell pm path "$PACKAGE" >/dev/null 2>&1; then
    echo "$PACKAGE is not installed on $DEVICE" >&2
    exit 1
fi

echo "Capturing initial Launcher state. The configured widget must show the 7 audit dishes."
dump_ui initial
capture_widget initial
python3 - "$OUT_DIR/bounds-initial.txt" "$("${ADB[@]}" shell wm density | tr -dc '0-9\n' | tail -n 1)" <<'PY'
import sys

x1, y1, x2, y2, width, height = map(int, open(sys.argv[1]).read().split())
density = int(sys.argv[2])
height_dp = height * 160 / density
print(f"FridgeBoard widget bounds={[x1, y1, x2, y2]} height_dp={height_dp:.1f}")
if height_dp < 180:
    raise SystemExit("widget is below 180dp; compact two-row acceptance cannot pass")
PY

ui_assert_list initial "${EXPECTED[0]}"
for index in 1 2 3 4 5 6; do
    swipe_list up
    dump_ui "scroll-$index"
    capture_widget "scroll-$index"
    ui_assert_list "scroll-$index"
done
ui_assert_list scroll-6 "${EXPECTED[6]}"
for index in 1 2 3 4 5 6; do swipe_list down; done
dump_ui returned
capture_widget returned
ui_assert_list returned "${EXPECTED[0]}"

echo "Checking 15 seconds of idle rendering."
"${ADB[@]}" logcat -c
"${ADB[@]}" shell dumpsys netstats detail > "$OUT_DIR/netstats-before.txt"
"${ADB[@]}" shell "run-as $PACKAGE sqlite3 no_backup/androidx.work.workdb \
    'select id,state,run_attempt_count,last_enqueue_time from workspec order by id;'" \
    > "$OUT_DIR/work-before.txt"
"${ADB[@]}" shell "run-as $PACKAGE sh -c 'if [ -d files/recipe_widget_logs ]; then ls -la files/recipe_widget_logs; else echo absent; fi'" \
    > "$OUT_DIR/log-files-before.txt"

for label in idle-0 idle-5 idle-10 idle-15; do
    if [[ "$label" != idle-0 ]]; then sleep 5; fi
    dump_ui "$label"
    capture_widget "$label"
done

"${ADB[@]}" shell dumpsys netstats detail > "$OUT_DIR/netstats-after.txt"
"${ADB[@]}" shell "run-as $PACKAGE sqlite3 no_backup/androidx.work.workdb \
    'select id,state,run_attempt_count,last_enqueue_time from workspec order by id;'" \
    > "$OUT_DIR/work-after.txt"
"${ADB[@]}" shell "run-as $PACKAGE sh -c 'if [ -d files/recipe_widget_logs ]; then ls -la files/recipe_widget_logs; else echo absent; fi'" \
    > "$OUT_DIR/log-files-after.txt"
"${ADB[@]}" logcat -d -v epoch > "$OUT_DIR/idle-logcat.txt"

APP_UID=$("${ADB[@]}" shell cmd package list packages -U "$PACKAGE" \
    | sed -n 's/.* uid:\([0-9][0-9]*\).*/\1/p' | head -n 1 | tr -d '\r')
if [[ -z "$APP_UID" ]]; then
    echo "unable to determine UID for $PACKAGE" >&2
    exit 1
fi

python3 - "$OUT_DIR" "$PACKAGE" "$APP_UID" <<'PY'
import glob
import hashlib
import re
import sys
import xml.etree.ElementTree as ET

out, package, uid = sys.argv[1:]
paths = sorted(glob.glob(f"{out}/widget-idle-*.png"))
if len(paths) != 4:
    raise SystemExit(f"expected 4 idle crops, found {len(paths)}")
digests = [hashlib.sha256(open(path, "rb").read()).hexdigest() for path in paths]
if len(set(digests)) != 1:
    raise SystemExit(f"idle screenshot hashes changed: {digests}")
bounds = [open(path.replace("widget-idle-", "bounds-idle-").replace(".png", ".txt"),
               encoding="utf-8").read() for path in paths]
if len(set(bounds)) != 1:
    raise SystemExit("idle widget bounds changed")

baseline_names = None
for label in ("idle-0", "idle-5", "idle-10", "idle-15"):
    root = ET.parse(f"{out}/ui-{label}.xml").getroot()
    names = []
    for node in root.iter():
        if (node.attrib.get("package") == package
                and node.attrib.get("resource-id", "").endswith("widget_row_recipe")
                and node.attrib.get("text")):
            names.append(node.attrib["text"])
    if baseline_names is None:
        baseline_names = names
    if not names or names != baseline_names:
        raise SystemExit(f"{label}: idle list changed to {names!r}")

logcat = open(f"{out}/idle-logcat.txt", encoding="utf-8", errors="replace").read()
unexpected = [line for line in logcat.splitlines()
              if re.search(r"RecipeWidget(Worker|Scheduler|Http)|WorkManager", line, re.I)]
if unexpected:
    raise SystemExit("new widget/WorkManager log lines during idle:\n" + "\n".join(unexpected))

before = open(f"{out}/work-before.txt", encoding="utf-8").read()
after = open(f"{out}/work-after.txt", encoding="utf-8").read()
if not before.strip() or not after.strip():
    raise SystemExit("could not capture WorkManager database before/after idle")
if before != after:
    raise SystemExit("WorkManager workspec rows changed during idle")
log_files_before = open(f"{out}/log-files-before.txt", encoding="utf-8").read()
log_files_after = open(f"{out}/log-files-after.txt", encoding="utf-8").read()
if log_files_before != log_files_after:
    raise SystemExit("widget diagnostic log files changed during idle")

def uid_bytes(path):
    rx = tx = 0
    found = False
    for line in open(path, encoding="utf-8", errors="replace"):
        if f"uid={uid}" not in line:
            continue
        found = True
        rx_match = re.search(r"rxBytes=(\d+)", line)
        tx_match = re.search(r"txBytes=(\d+)", line)
        if rx_match:
            rx += int(rx_match.group(1))
        if tx_match:
            tx += int(tx_match.group(1))
    return found, rx, tx

before_bytes = uid_bytes(f"{out}/netstats-before.txt")
after_bytes = uid_bytes(f"{out}/netstats-after.txt")
if before_bytes[0] and after_bytes[0] and (after_bytes[1] > before_bytes[1]
                                           or after_bytes[2] > before_bytes[2]):
    raise SystemExit(f"FridgeBoard UID network bytes increased: {before_bytes} -> {after_bytes}")
if not before_bytes[0] and not after_bytes[0]:
    print("netstats: no rows recorded for the app UID; byte-level network check not available")
print(f"idle stable: sha256={digests[0]}, four crops identical, no new widget logs/work")
PY

echo "PASS: Launcher native list scrolling, no page dots, recipe order, idle stability, and work/log checks."
echo "请对照截图核验右侧咖啡色滚动条；UIAutomator 不暴露滚动条颜色。"
echo "Artifacts: $OUT_DIR"
