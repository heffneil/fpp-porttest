# Port Test Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** An FPP plugin, "Port Test", whose Status/Control page lights only the ticked pixel-string ports by running FPP's existing channel test over those ports' channels.

**Architecture:** One PHP page shell (`status.php`) inlines four dependency-free JS files: `porttest-core.js` (pure channel math, parsing, recognition), `porttest-updater.js` (debounced single-flight sender), `porttest-api.js` (FPP API calls) and `porttest-ui.js` (DOM). No fppd change. Pure logic is unit-tested with Node's built-in runner; the page is checked against an off-device PHP harness; behavior is proven on real boards, because a mocked API proves only what the mock assumes.

**Tech Stack:** PHP 8 page shell, vanilla JS in UMD modules (no dependencies), Bootstrap 5.3 classes from FPP, `node --test` (Node 24) for dev-only tests, a PHP built-in-server harness.

**Spec:** `docs/superpowers/specs/2026-11-06-port-test-plugin-design.md` (read its "Changes while planning" section).

## Global Constraints

From the spec, verbatim:

- No change to fppd and none to FPP's own pages. Must leave FPP's own Testing dropdown untouched.
- Works on every pixel board type FPP supports (BeagleBone Black, PocketBeagle 2, Pi).
- No external network access, no data collected: privacy block with empty sends, collects and sensors, remoteAccess none, systemChanges none, closedCode false.
- Must follow the FPP plugin guidelines: theme-aware, no hardcoded colors, Bootstrap, responsive, touch-friendly.
- Minimum FPP version 10.0.
- Plugin name "Port Test", `repoName` `fpp-porttest`, GitHub repo `heffneil/fpp-porttest`, local folder `/Users/neilheuer/claude-code/fpp-plugin-PortTest`, same layout as the fpp-movingheads plugin, GPL-2.0.
- `Test Start` takes `[interval, effect, channelSet, value]` in that order. Interval is milliseconds, 100 to 10000, default 1000. `RGB Single Color`: value is a hex color with a leading `#`, default dim white `#404040`. `RGB Chase` and `RGB Cycle`: value is one of `R-G-B`, `R-G-B-W`, `R-G-B-All`, `R-G-B-W-All`, `R-G-B-None`, `R-G-B-W-None`, `R-G-B-All-None`, `R-G-B-W-All-None`.
- channelSet ranges are `start-end` (1-based, inclusive), **separated by `;`, never commas.**
- Never use the `Output Specific` effect.
- Ports come from FPP's API: `GET /api/channel/output/co-bbbStrings` when `$settings['BeaglePlatform']` is set, otherwise `co-pixelStrings`. If that output is missing or disabled the page says "No pixel string output is configured on this board."
- Nothing is ticked by default. Status reads "Testing N of M ports". Ticked rows use Bootstrap `table-success` while a test runs. A test stays lit until Neil turns it off: no automatic timeout, and nothing stops a test on page close.
- A string's channels: `nodes × colorOrder.length`, where `nodes` is `pixelCount`, or `ceil(pixelCount / groupCount)` when `groupCount` is above 1. A port's channels are the union of its strings' ranges.
- Port label is `portNumber + 1`. `portNumber` is zero-based in FPP's config.

Added by this plan (conventions copied from fpp-movingheads):

- Assets live in `assets/` and are inlined by `readfile` in `status.php`. Never put them in `js/` or `css/`: plugin.php serves those immutably with no version stamp, so an update would never reach a browser that had loaded the page once.
- Every string that comes from the board (descriptions) is rendered with `textContent`, never `innerHTML`. JSON handed to inline script uses `JSON_HEX_TAG|JSON_HEX_AMP|JSON_HEX_APOS|JSON_HEX_QUOT`.
- Default branch is `main`. No icon in v1.

## Review Focus

Failure modes the spec implies but would not otherwise be tested, most likely first. The test for each is in the task named.

1. A port description containing markup (`</script><img src=x onerror=alert(1)>`) shows as plain text and nothing executes. Task 4 (core returns it unchanged) and Task 7 (page check).
2. `Test Start` fails (HTTP 500, network error or `{"Status":"Error"}`): the page shows an error, shows no "Testing" status or tint, and keeps the ticks. Task 8.
3. A running test the page did not make or cannot map (partial port, channels beyond ports, other effect, no `channelSet`, malformed body): a "different test is running" notice with a Stop button, never taken over, no crash. Task 5.
4. Strings with `groupCount` 0, 1 or uneven, four-channel color orders, and multi-string ports where some strings are at 0 pixels give the right ranges. Task 3.
5. Two ports that share channels are both flagged, and ticking one tells you the other will light too. Task 4 and Task 7.

## File Structure

```
pluginInfo.json  menu.inc  status.php  about.php  LICENSE  README.md  .gitignore
scripts/fpp_install.sh  scripts/fpp_uninstall.sh  scripts/dev/spike_multirange.py
assets/porttest-core.js     pure functions: ranges, summaries, overlaps, test bodies, recognition
assets/porttest-updater.js  debounced, single-flight sender
assets/porttest-api.js      the three FPP calls
assets/porttest-ui.js       DOM, selection, controls, wiring
harness/preview.php  harness/fixtures/*.json  harness/README.md
tests/*.test.js  tests/fixtures/testing-running-fill.json
docs/spike-results.md  docs/hardware-acceptance.md
```

Run all unit tests with `node --test tests/`. Port data shape (from a live 10.3 board): `{portNumber, protocol, virtualStrings: [{startChannel, pixelCount, groupCount, colorOrder, description, ...}]}`.

---

### Task 1: Repo, and the hardware spike on 172.16.0.52

**Files:** Create `.gitignore`, `scripts/dev/spike_multirange.py`, `docs/spike-results.md`, `tests/fixtures/testing-running-fill.json`.

**Interfaces:** Produces a recorded yes or no that `;`-joined ranges with `RGB Single Color` light only the named ports on a BeagleBone Black, and the real `GET /api/fppd/testing` body of a running test, saved as `tests/fixtures/testing-running-fill.json` (Task 5 and the Task 8 harness copy its shape).

- [ ] **Step 1:** In the plugin folder run `git init -b main`. Write `.gitignore` with `harness/.preview-media/` and `node_modules/`. Commit it with the spec and this plan: `docs: add Port Test design and plan`.
- [ ] **Step 2:** Write `scripts/dev/spike_multirange.py` (stdlib only, throwaway, no tests). Usage: `spike_multirange.py HOST PORT [PORT...] [--sep ';'] [--go] [--stop] [--save PATH]`. `PORT` is the number shown on the Pixel Strings page (`portNumber + 1`). It reads `GET /api/channel/output/co-bbbStrings`, computes each port's channels (3 per pixel, no grouping; spike only), prints the channelSet and the exact JSON body, and sends nothing unless `--go`. With `--go` it POSTs `Test Start` with args `["1000","RGB Single Color",<channelSet>,"#404040"]` to `/api/command`, then prints `GET /api/fppd/testing` (and writes it to `--save PATH`). `--stop` POSTs `Test Stop`.
- [ ] **Step 3:** Dry run: `python3 scripts/dev/spike_multirange.py 172.16.0.52 2 5`. Expected: one channelSet with exactly two ranges joined by `;`, and nothing sent. While ports are still consecutive at 800 pixels they are `207209-209608;214409-216808`.
- [ ] **Step 4:** **Stop and ask Neil** to confirm he is at `.52` and can see the props on ports 2 and 5. Do not run `--go` without his yes.
- [ ] **Step 5:** With his yes: `python3 scripts/dev/spike_multirange.py 172.16.0.52 2 5 --go --save tests/fixtures/testing-running-fill.json`. Expected: only the props on ports 2 and 5 light, dim white, and the saved JSON has `"enabled":1` and the channelSet that was sent.
- [ ] **Step 6:** `python3 scripts/dev/spike_multirange.py 172.16.0.52 2 5 --stop`. Expected: everything dark, and `GET /api/fppd/testing` returns config `{"enabled":0}`.
- [ ] **Step 7 (optional, record only):** repeat steps 5 and 6 with `--sep ','` to learn whether 10.3 accepts commas. The plugin uses `;` either way.
- [ ] **Step 8:** Write `docs/spike-results.md` (date, board, ports, separator, what lit, the saved response, the comma result). **If anything other than exactly ports 2 and 5 lit, stop and report to Neil; do not start Task 2.** Commit: `docs: record multi-range hardware spike`.

### Task 2: Plugin skeleton and manifest

**Files:** Create `pluginInfo.json`, `menu.inc`, `status.php`, `about.php`, `scripts/fpp_install.sh`, `scripts/fpp_uninstall.sh`, `LICENSE` (GPL-2.0), `README.md` (stub). Test: `tests/manifest.test.js`.

**Interfaces:** Produces a `status.php` that renders `<div id="porttest"></div>`, defines `window.PORTTEST_CONFIG = {configFile: "co-bbbStrings" | "co-pixelStrings"}`, and inlines each of `assets/porttest-core.js`, `porttest-updater.js`, `porttest-api.js`, `porttest-ui.js` that exists, in that order (guard each with `is_readable` so earlier tasks run before the later files exist), then an inline script that calls `PortTestUI.init(document.getElementById('porttest'), {configFile: window.PORTTEST_CONFIG.configFile, api: PortTestApi.createApi()})` only when both `PortTestUI` and `PortTestApi` are defined.

- [ ] **Step 1:** Write `tests/manifest.test.js` with these tests:
  - `identity`: `repoName` is `fpp-porttest`, `name` is `Port Test`, `author` is `heffneil`, `srcURL` is `https://github.com/heffneil/fpp-porttest.git`.
  - `versions`: exactly one entry equal to `{minFPPVersion:"10.0", maxFPPVersion:"0", branch:"main", sha:""}`.
  - `privacy`: has exactly the keys `summary, sends, collects, sensors, remoteAccess, systemChanges, closedCode, other`; `sends`, `collects`, `sensors`, `systemChanges` deep-equal `[]`; `remoteAccess` is `none`; `closedCode` is `false`; `summary.length <= 200`.
  - `menu`: `menu.inc` has exactly one `'type' => 'status'` entry (page `status.php`) and one `'type' => 'help'` entry (page `about.php`).
  - `pages`: `status.php` and `about.php` contain neither `<html` nor `<head`; `status.php` references `assets/` and never `js/` or `css/`.
  - `install`: both scripts start with `#!/bin/bash` and contain `exit 0`.
- [ ] **Step 2:** Run `node --test tests/`. Expected: FAIL (files missing).
- [ ] **Step 3:** Create the files. `pluginInfo.json` follows fpp-movingheads' format (tab-indented) with `allowUpdates: 1`, `releaseNotesStyle: "gitHistory"`, no `iconURL`, and a privacy `summary` of "Lights chosen pixel ports using FPP's own channel test on this device. Nothing is sent anywhere or stored." `menu.inc` has the status entry "Port Test" and the help entry "Port Test - Help", both `'wrap' => 1`. `status.php` picks `configFile` from `!empty($settings['BeaglePlatform'])` and prints the config with the `JSON_HEX_*` flags. `about.php` covers: what it does, the 800-pixel commissioning tip, that tests stay lit until Off, the shared-channels warning. `fpp_install.sh` echoes a line and exits 0. `fpp_uninstall.sh` sources `${FPPDIR}/scripts/common`, then POSTs `{"command":"Test Stop","args":[]}` to `http://localhost/api/command` with `--connect-timeout 2 --max-time 10`, ignores failure, and exits 0.
- [ ] **Step 4:** Run `node --test tests/` (Expected: PASS) and `php -l status.php && php -l about.php && php -l menu.inc` (Expected: "No syntax errors detected" three times).
- [ ] **Step 5:** Commit: `feat: plugin skeleton, manifest and menu`.

### Task 3: Channel math

**Files:** Create `assets/porttest-core.js`. Test: `tests/core-ranges.test.js`.

**Interfaces:** Produces, on `PortTestCore` (UMD: `module.exports` in Node, `window.PortTestCore` in the browser):

```
stringRange(vs): [number, number] | null          // null when pixelCount <= 0
mergeRanges(ranges): Array<[number, number]>      // sorted; adjacent and overlapping ranges merged
portRanges(port): Array<[number, number]>         // a port's string ranges, through mergeRanges
formatChannelSet(ranges): string                  // "4801-7200;9601-12000"; "" for []
```

- [ ] **Step 1:** Write `tests/core-ranges.test.js`:
  - `800 RGB pixels at 204809` → `[204809, 207208]`
  - `groupCount 0 and 1 mean no grouping`: 100 px at 1 → `[1, 300]` for both
  - `groupCount 2`: 800 px at 1 → `[1, 1200]`
  - `uneven groups round up`: 10 px, groupCount 3, at 1 → `[1, 12]`
  - `RGBW uses four channels`: `colorOrder:"RGBW"`, 100 px at 1 → `[1, 400]`
  - `missing colorOrder defaults to RGB`
  - `zero or negative pixelCount` → `null`
  - `portRanges merges adjacent strings`: 800 px at 1 plus 400 px at 2401 → `[[1, 3600]]`
  - `portRanges keeps a gap`: 800 px at 1 and at 4801 → `[[1, 2400], [4801, 7200]]`
  - `portRanges skips zero-pixel strings` in a multi-string port, and a port whose strings are all zero → `[]`
  - `portRanges sorts strings given out of order`
  - `mergeRanges([[10,20],[1,5],[6,9],[15,30]])` → `[[1,30]]`; `[[1,5],[8,9]]` stays as two ranges
  - `formatChannelSet([[4801,7200],[9601,12000]])` → `"4801-7200;9601-12000"`, never containing `,`; `[]` → `""`
- [ ] **Step 2:** Run `node --test tests/core-ranges.test.js`. Expected: FAIL (module not found).
- [ ] **Step 3:** Implement the four functions in `assets/porttest-core.js` using integer math only.
- [ ] **Step 4:** Run `node --test tests/`. Expected: all PASS.
- [ ] **Step 5:** Commit: `feat(core): channel range math`.

### Task 4: Port summaries and overlaps

**Files:** Modify `assets/porttest-core.js`. Test: `tests/core-ports.test.js`.

**Interfaces:** Produces:

```
summarizePort(port): {
  portNumber: number, label: string, protocol: string, description: string,
  startChannel: number | null, endChannel: number | null, pixelCount: number,
  ranges: Array<[number, number]>, hasPixels: boolean }
findOverlaps(summaries): { [portNumber: number]: number[] }   // other portNumbers sharing any channel
selectionChannelSet(summaries, selected: number[]): string     // union of the selected ports' ranges, merged, joined with ';'
```

- [ ] **Step 1:** Write `tests/core-ports.test.js`:
  - `label is portNumber + 1 as a string`
  - `multi-string port`: strings 800 px at 1 (description `""`) and 800 px at 4801 (description `"Roof"`) → `startChannel` 1, `endChannel` 7200, `pixelCount` 1600, `description` `"Roof"`, `protocol` from the port
  - `no pixels`: a port with no strings, or all at 0 → `hasPixels` false, `startChannel` and `endChannel` null, `ranges` `[]`
  - `description is returned unchanged`: `"</script><img src=x onerror=alert(1)>"` comes back identical (Review Focus 1; the UI's job is `textContent`)
  - `findOverlaps`: ports spanning 1-2400 and 2401-4800 → `{}`; ports 0 (1-2400) and 3 (2000-3000) → `{0:[3], 3:[0]}`; three mutually overlapping ports each list the other two; a port with no pixels never appears
  - `selectionChannelSet` with 48 ports of 800 RGB pixels from channel 1: selecting portNumbers `[2, 5]` → `"4801-7200;12001-14400"`; `[2, 3]` (adjacent) → `"4801-9600"`; `[]` → `""`; a selected port with no pixels contributes nothing
- [ ] **Step 2:** Run `node --test tests/core-ports.test.js`. Expected: FAIL.
- [ ] **Step 3:** Implement the three functions; `endChannel` is the highest range end.
- [ ] **Step 4:** Run `node --test tests/`. Expected: all PASS.
- [ ] **Step 5:** Commit: `feat(core): port summaries and overlap detection`.

### Task 5: Test commands and recognising a running test

**Files:** Modify `assets/porttest-core.js`. Test: `tests/core-recognise.test.js`; uses `tests/fixtures/testing-running-fill.json` (from Task 1).

**Interfaces:** Consumes `parseChannelSet` within `recognise`, and `summarizePort` output. Produces:

```
PATTERNS: { solid: 'RGB Single Color', chase: 'RGB Chase', cycle: 'RGB Cycle' }
CHASE_TYPES: string[]            // the eight values in Global Constraints
DEFAULT_COLOR = '#404040'; DEFAULT_INTERVAL_MS = 1000
buildTestStart({pattern: 'solid'|'chase'|'cycle', channelSet: string, value: string, intervalMs?: number}):
  { command: 'Test Start', multisyncCommand: false, multisyncHosts: '', args: [string, string, string, string] }
buildTestStop(): { command: 'Test Stop', multisyncCommand: false, multisyncHosts: '', args: [] }
parseChannelSet(str: string): Array<[number, number]>       // accepts ';' and ','; single channels; ignores empty tokens
chaseTypeFromSubMode(subMode: string): string               // 'RGBChase-RGBWAN' → 'R-G-B-W-All-None'; unknown → 'R-G-B'
recognise(summaries, testingBody): { kind: 'none' }
  | { kind: 'ours', ports: number[], pattern: 'solid'|'chase'|'cycle', value: string }
  | { kind: 'other', reason: string }
```

`testingBody` is the whole `GET /api/fppd/testing` response (`{Status, config}`). For `ours`, `ports` are `portNumber`s and `value` is lowercase `#rrggbb` (from `color1..3`) or the chase type.

- [ ] **Step 1:** Write `tests/core-recognise.test.js`. Port set for the tests: 48 ports of 800 RGB pixels starting at 1, 2400 channels each. The one exception is the captured-fixture test, which uses ports starting at 204809 (`.52`'s layout when the spike ran); if `docs/spike-results.md` records a different layout, use that one.
  - `buildTestStart solid`: args deep-equal `['1000','RGB Single Color','4801-7200','#404040']`; `chase`: `['1000','RGB Chase','4801-7200','R-G-B']`; `cycle` likewise with `RGB Cycle`
  - `interval is clamped`: 50 → `'100'`, 99999 → `'10000'`
  - `no effect string is ever Output Specific`
  - `buildTestStop` equals the object above
  - `parseChannelSet('1-3;7;9-10')` → `[[1,3],[7,7],[9,10]]`; `'1-3,7'` → `[[1,3],[7,7]]`; `';;'` and `'abc'` → `[]`
  - `chaseTypeFromSubMode` table: `RGBChase-RGB`→`R-G-B`, `RGBChase-RGBA`→`R-G-B-All`, `RGBChase-RGBN`→`R-G-B-None`, `RGBChase-RGBAN`→`R-G-B-All-None`, `RGBChase-RGBW`→`R-G-B-W`, `RGBChase-RGBWA`→`R-G-B-W-All`, `RGBChase-RGBWN`→`R-G-B-W-None`, `RGBChase-RGBWAN`→`R-G-B-W-All-None`
  - `idle`: `{Status:'OK',config:{enabled:0}}` → `{kind:'none'}`
  - `ours from the captured fixture` (channelSet for ports 2 and 5) → `ours`, ports `[1,4]`, pattern `solid`, value `#404040`
  - `merged adjacent ports`: channelSet `4801-9600` → ours, ports `[2,3]`
  - `other, with a reason`, no crash, for each of: a partial port (`4801-5000`); channels beyond whole ports (`4801-7200;99999-100000`); `{mode:'Outputs'}` with no channelSet; `{mode:'SingleChase', channelSet:'1-2400'}`; a body with no `config`; `null`; `"x"`
- [ ] **Step 2:** Run `node --test tests/core-recognise.test.js`. Expected: FAIL.
- [ ] **Step 3:** Implement. `recognise` compares expanded channel sets (not range strings), so merged ranges across adjacent ports are not ambiguous. A port counts as ticked only when all of its channels are in the test's set, and the set must contain no channel outside those ports.
- [ ] **Step 4:** Run `node --test tests/`. Expected: all PASS.
- [ ] **Step 5:** Commit: `feat(core): test bodies, channel set parsing and recognition`.

### Task 6: Debounced single-flight updater

**Files:** Create `assets/porttest-updater.js`. Test: `tests/updater.test.js`.

**Interfaces:** Produces on `PortTestUpdater`:

```
createUpdater({ send: (selection) => Promise<void>, onError: (err: Error) => void,
                delayMs?: number /* 300 */, setTimer?: (fn, ms) => any, clearTimer?: (id) => void }):
  { request(selection: number[]): void }
```

- [ ] **Step 1:** Write `tests/updater.test.js` with fake timers and promises resolved by the test:
  - `five requests inside the delay send once, with the fifth selection`
  - `a request during an in-flight send does not overlap`: after the first send resolves, exactly one more send happens, with the latest selection
  - `a rejected send calls onError with that error and does not block the next request`
  - `a request after the quiet delay sends again`
- [ ] **Step 2:** Run `node --test tests/updater.test.js`. Expected: FAIL.
- [ ] **Step 3:** Implement `createUpdater`: one timer, one in-flight flag, a `pending` slot holding only the latest selection.
- [ ] **Step 4:** Run `node --test tests/`. Expected: all PASS.
- [ ] **Step 5:** Commit: `feat: debounced single-flight updater`.

### Task 7: The page: ports and selection

**Files:** Create `assets/porttest-api.js` (only `getOutput` for now), `assets/porttest-ui.js`, `harness/preview.php`, `harness/fixtures/co-bbbStrings.json`, `harness/fixtures/co-bbbStrings-edge.json`, `harness/README.md`.

**Interfaces:** Consumes `summarizePort`, `findOverlaps` and the `status.php` init call from Task 2. Produces:

```
PortTestApi.createApi(fetchFn = fetch): { getOutput(configFile: string): Promise<{ ports: Port[] } | null> }
PortTestUI.init(root: HTMLElement, opts: { configFile: string, api: PortTestApi }): Promise<{ getSelection(): number[] }>
```

`getOutput` fetches `GET /api/channel/output/<configFile>` and returns the first `channelOutputs` entry that is an object with a truthy `enabled`, as `{ports: entry.outputs}`; it returns `null` when there is none, and rejects with an `Error` on a non-2xx response or invalid JSON. `getSelection` returns the ticked `portNumber`s.

Fixtures. Normal: 48 ports, `portNumber` 0-47, protocol `ws2811`, one string each, `startChannel = 1 + portNumber*2400`, 800 px, group 1, `RGB`, blank description. Edge (labels are `portNumber+1`): label 1 description `</script><img src=x onerror=alert(1)>`; label 2 at 0 pixels; label 5 starts at 9000 so it overlaps label 4; label 6 has two strings (800 px at 12001 and 100 px at 14401); label 7 is `RGBW`, 100 px at 14701. A third fixture, `disabled`, is the normal one with `enabled:0`.

- [ ] **Step 1:** Write the harness: `php -S 127.0.0.1:8146 -t harness harness/preview.php`. It stubs `$settings` (`BeaglePlatform` set) the way fpp-movingheads' `harness/plugin-preview.php` does, wraps `status.php` like plugin.php would, serves `GET /api/channel/output/co-bbbStrings` from the fixture chosen with `GET /harness/fixture?name=normal|edge|disabled`, and logs every request to `harness/.preview-media/requests.log` (`GET /requests`, `GET /reset`). Task 8 adds the command and testing mocks.
- [ ] **Step 2:** Run it and open `http://127.0.0.1:8146/`. Expected: the page shell renders and `fetch('/api/channel/output/co-bbbStrings').then(r=>r.json())` returns 48 outputs.
- [ ] **Step 3:** Implement `PortTestUI.init` using only Bootstrap classes. A `table table-sm align-middle` with a header checkbox `#ptAll` and one row per port: checkbox, port label, protocol, description, start channel, pixel count, end channel. Tapping anywhere on an enabled row toggles it (large target: `py-2` rows, checkbox sized with `fs-4`). `#ptAll` selects or clears every enabled row and sets `indeterminate` when only some are ticked. Zero-pixel rows: disabled checkbox, `text-body-secondary`, and the hint "Set a pixel count on the Pixel Strings page". Overlap: a `badge text-bg-warning` reading "also lights port N" per other port. Empty: `alert alert-info` with "No pixel string output is configured on this board." Load failure: `alert alert-danger`. Build all cells with `createElement` and `textContent`.
- [ ] **Step 4:** Verify in the Browser pane. Each check must hold (JS expression → expected value):
  - Normal fixture: `document.querySelectorAll('#porttest tbody tr').length` → `48`; `#ptAll` `.checked` and `.indeterminate` → `false`, `false`.
  - Click row 3: `document.querySelectorAll('#porttest tbody input:checked').length` → `1`, and `#ptAll.indeterminate` → `true`.
  - Click `#ptAll`: checked count → `48`, `#ptAll.checked` → `true`; click again: → `0`.
  - Every row: `tr.getBoundingClientRect().height >= 44` → `true`.
  - Edge fixture: `document.querySelector('#porttest img')` → `null`; row 1's description cell `.textContent` equals the hostile string exactly; no dialog appeared (Review Focus 1).
  - Edge fixture: row 2's checkbox `.disabled` → `true` and the hint text is present; rows 4 and 5 hold badges "also lights port 5" and "also lights port 4" (Review Focus 5); row 6's end channel is `14700`; row 7's is `15100`.
  - `disabled` fixture: the page text contains "No pixel string output is configured on this board."
- [ ] **Step 5:** Commit: `feat(ui): port table with selection, zero-pixel and overlap handling`.

### Task 8: Test control: start, update, stop, restore, errors

**Files:** Modify `assets/porttest-api.js`, `assets/porttest-ui.js`, `harness/preview.php`.

**Interfaces:** Consumes `buildTestStart`, `buildTestStop`, `selectionChannelSet`, `recognise`, `createUpdater`. Produces, added to `PortTestApi.createApi`'s return value:

```
getTesting(): Promise<object>             // the full /api/fppd/testing body
command(body: object): Promise<void>      // POST /api/command; rejects with Error(message) on non-2xx, non-JSON, or {Status:'Error'}
```

Page elements added: `#ptPattern` (a select labelled "Testing:" with options `off` "Off", `solid` "Solid color", `chase` "RGB Chase", `cycle` "RGB Cycle"), `#ptColor` (`input type=color`, default `#404040`, shown for solid), `#ptChaseType` (the eight values, shown for chase and cycle), `#ptStatus` (M is the number of ports listed), `#ptHint`, `#ptNotice` with `#ptNoticeStop`, `#ptError`.

- [ ] **Step 1:** Extend the harness. `POST /api/command` logs the body and updates `harness/.preview-media/testing.json` in exactly the shape saved in `tests/fixtures/testing-running-fill.json` (copy its keys; for chase and cycle follow `ChannelTester.cpp` `Test Start`: `mode` `RGBChase`/`RGBCycle`, `subMode`, `colorPattern`); `Test Stop` writes `{"enabled":0}`; `GET /api/fppd/testing` returns `{"Status":"OK","config":<that file>,"respCode":200}`. Add `GET /harness/seed?name=none|ports2and5|other` (`other` is `{"enabled":1,"mode":"Outputs","outputs":"BBB Pixel Strings","type":1}`) and `GET /harness/fail?on=1|0` (command returns HTTP 500 when on).
- [ ] **Step 2:** Implement `porttest-api.js`, then the behavior in `porttest-ui.js`: choosing a pattern with nothing ticked sends nothing and shows "Tick at least one port" in `#ptHint`; with ports ticked, every tick, untick or pattern change goes through the updater and sends one `Test Start` (no `Test Stop` in between); unticking the last port, or choosing `off`, sends `Test Stop`. `#ptStatus` reads "Testing N of M ports" and ticked rows get `table-success` only while a test is running. On load, call `getTesting()` then `recognise`: `ours` ticks the ports and restores the pattern, color and chase type with no request sent; `other` shows `#ptNotice` ("A different test is running.") and `#ptNoticeStop` sends `Test Stop`. A rejected command fills `#ptError` ("Test Start failed: <message>"), clears the status and the tint, and keeps the ticks. Nothing may send `Test Stop` on page close or unload.
- [ ] **Step 3:** Verify in the Browser pane against the harness, using `GET /requests` for exact bodies. Each must hold:
  - Choose Solid color, nothing ticked: no `Test Start` logged; `#ptHint` text is "Tick at least one port".
  - Tick row 3: the logged body is `{"command":"Test Start","multisyncCommand":false,"multisyncHosts":"","args":["1000","RGB Single Color","4801-7200","#404040"]}`.
  - Tick row 6: a second `Test Start` with `"4801-7200;12001-14400"` and no `Test Stop` logged between them; `#ptStatus` text is "Testing 2 of 48 ports"; exactly rows 3 and 6 have `table-success`.
  - Click rows 7, 8, 9 and 10 within 100 ms: exactly one more `Test Start`, with all six ports.
  - Untick everything: a `Test Stop` is logged; `#ptStatus` is empty; no row has `table-success`.
  - Choose Chase: `#ptChaseType` shows and `#ptColor` hides; the next body has `"RGB Chase"` and `"R-G-B"`.
  - Seed `ports2and5` and reload: rows 2 and 5 are ticked and tinted, the pattern is Solid, `#ptColor` is `#404040`, `#ptStatus` is "Testing 2 of 48 ports", and the log shows no `Test Start` and no `Test Stop` from the load.
  - Seed `other` and reload: `#ptNotice` is visible and contains "A different test is running"; clicking `#ptNoticeStop` logs a `Test Stop` (Review Focus 3).
  - Failure mode on, tick a port: `#ptError` contains "Test Start failed"; `#ptStatus` is empty; no row has `table-success`; the tick is still checked (Review Focus 2).
- [ ] **Step 4:** Run `node --test tests/` (Expected: all PASS) and `php -l status.php`. Commit: `feat(ui): start, update, stop and restore tests`.

### Task 9: Publish, install and prove it on 172.16.0.52

**Files:** Modify `README.md`. Create `docs/hardware-acceptance.md`.

- [ ] **Step 1:** Finish `README.md`: what it does, how to install, how to use it, and the limits (channel patterns only; ports must not share channels; cape labels not shown; a test stays lit until turned Off; Pi uses `co-pixelStrings` and is untested).
- [ ] **Step 2:** Run `node --test tests/` (Expected: all PASS) and `php -l` on each PHP file. Commit: `docs: README`.
- [ ] **Step 3:** **Ask Neil** for permission to create the public repo. On yes: `gh repo create heffneil/fpp-porttest --public --source . --remote origin --push --description "Light chosen pixel ports on an FPP controller to find which props are on them."`. Verify: `gh repo view heffneil/fpp-porttest --json visibility` shows `PUBLIC`, and `curl -sI https://raw.githubusercontent.com/heffneil/fpp-porttest/main/pluginInfo.json` returns HTTP 200.
- [ ] **Step 4:** **Ask Neil** to let me raise `.52`'s UI level from 1 to 3 (needed to paste a URL into the Plugin Manager). On yes: `curl -s -X PUT -d "3" http://172.16.0.52/api/settings/uiLevel`. Verify the value reads `3`. Revert any time with `-d "1"`.
- [ ] **Step 5:** Neil installs it from the Plugin Manager on `.52`: reload `plugins.php`, paste `https://raw.githubusercontent.com/heffneil/fpp-porttest/main/pluginInfo.json` into the search box, read the install dialog's privacy summary, click Install. (I do not click Install.) Expected: "Port Test" appears under Status/Control and `curl -s http://172.16.0.52/api/plugin` lists `fpp-porttest`.
- [ ] **Step 6:** Acceptance with Neil at the board (every port is already at 800 pixels). Record each result in `docs/hardware-acceptance.md`: (a) tick one port: only its props light and every other port is dark; (b) tick ports 2, 5 and 9: exactly those light; (c) untick 5 while running: within about 2 seconds port 5 goes dark and 2 and 9 stay lit without flicker; (d) with ports 2 and 9 still ticked, reload the page: rows 2 and 9 are ticked and tinted, the status reads "Testing 2 of 48 ports", and the props stayed lit through the reload; (e) choose Off: everything dark and `GET /api/fppd/testing` config is `{"enabled":0}`; (f) optional, only with Neil's yes and a revert afterwards: set port 5's start channel equal to port 4's on the Pixel Strings page, confirm the page shows both overlap badges, tick port 4 and record whether port 5's props also light. If any check fails, stop, record it, and bring it to Neil.
- [ ] **Step 7:** Commit and push: `docs: BeagleBone Black acceptance results`.

### Task 10: PocketBeagle 2 acceptance

**Files:** Modify `docs/hardware-acceptance.md`.

- [ ] **Step 1:** **Ask Neil** which PocketBeagle 2 board to use (candidates `.59`, `.61`, `.62`, `.63`, `.64`) and whether it is at 800 pixels per port; if not, he sets that on the Pixel Strings page first.
- [ ] **Step 2:** Repeat Task 9 steps 4 to 6 on that board (UI level to 3 with his OK, he installs from the Plugin Manager, checks a to e). If the board has smart receivers, also tick a port with a receiver and record whether it lights.
- [ ] **Step 3:** Record results in `docs/hardware-acceptance.md`, noting that the Pi is untested. Commit and push: `docs: PocketBeagle 2 acceptance results`.
