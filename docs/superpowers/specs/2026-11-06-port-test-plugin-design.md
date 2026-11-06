# Port Test: an FPP plugin to light chosen pixel ports

Date: 2026-11-06. Status: approved by Neil 2026-11-06. Amended while writing the plan; see "Changes while planning" at the end.

## Intent and why

Neil commissions FPP controllers (Kulp boards: BeagleBone Black K16A-B / K32A-B, PocketBeagle 2 K32-Max) before any props are assigned in xLights. At that point he needs to find out which props are on which physical port, and today he has no easy way to light just one port.

- **xLights** can light a port, but its test works from the channels of assigned models. With nothing assigned there is nothing to send.
- **FPP's own test** (the Testing dropdown on Channel Outputs → Pixel Strings) lights every port at once, and it only lights pixels that have a count on that page. Unused ports sit at zero (on one MAX board 51 of 64 ports are at 0; on one BeagleBone Black board 33 of 48), so it lights nothing on exactly the ports he is trying to identify.

His commissioning step, which is **not** this plugin's job: temporarily set 800 pixels on every port on the Pixel Strings page. This plugin then lets him light only the ports he picks and walk out and see which props respond.

## What it is

An FPP plugin named **Port Test** with its own page (Status/Control → Port Test). It lists the board's pixel-string ports, lets the user tick which ports to light, and runs one of FPP's existing channel tests over just those ports' channels. It changes nothing in fppd and nothing on FPP's own pages.

Why a plugin and not a change to FPP: a core change needs C++ changes in three pixel outputs and a new fppd on every board, and the existing per-port test code explicitly cannot isolate ports through channel ranges. A plugin installs from the Plugin Manager on every board with no rebuild. Neil chose a separate page.

## The page

```
Testing: [ Solid color ▾ ]  [color]   ● Testing 1 of 48 ports

 [–]  Port  Protocol  Description   Start Channel  Pixel Count  End Channel
 [ ]   1    ws2811                         1           800          2400
 [ ]   2    ws2811                      2401           800          4800
 [✓]   3    ws2811                      4801           800          7200     <- tinted green while testing
 [ ]   4    ws2811                      7201           800          9600
```

- One row per port, read-only, showing the settings from the board's pixel string configuration. A tick box on the left of each row; a header tick box that selects or clears all, and shows a dash when only some are ticked.
- A pattern dropdown labelled "Testing:" with Off plus the patterns below. Choosing a pattern starts the test on the ticked ports; choosing Off stops it.
- While a test runs, ticked rows are tinted green and the status beside the dropdown reads "● Testing N of M ports" (N ticked, M total). When Off, the status and tint go away.

## Decided by Neil

- It is a plugin with its own Port Test page, not a change to FPP's Channel Outputs page.
- A tick box to the left of each port, plus a select-all tick box in the header.
- The test applies only to ticked ports.
- Ticked rows tinted green and a status that reads "Testing N of M ports" while a test runs.
- No "only" shortcut link on each row.
- He sets 800 pixels on every port himself for commissioning; ports with no pixel count do not need special handling.
- A running test stays lit until he turns it off. No automatic timeout.
- The first board for hardware proof is **172.16.0.52** (Kulp32-LEFT-SIDE-OF-DOOR, BeagleBone Black, K32A-B, FPP 10.3). It already has 800 pixels on all 48 ports and no two ports share channels (checked), so the plugin's core assumption holds on its real configuration.

## How it works

- **Port list:** read through FPP's API, not the config files: `GET api/channel/output/co-bbbStrings` (BeagleBone Black and PocketBeagle 2) or `co-pixelStrings` (Pi). This is what FPP's own Pixel Strings page uses. Each port has one or more strings with a start channel, pixel count, group count and color order.
- **A port's channels:** the union of its strings' ranges. Each range runs from the start channel to start + nodes × channelsPerNode − 1, where channelsPerNode is the length of the color order and nodes is pixelCount, or ceil(pixelCount ÷ groupCount) when groupCount is above 1. Merge adjacent ranges and join them with `;`.
- **Running a test:** `POST api/command` with `Test Start` and `Test Stop`. `Test Start` takes `[interval, effect, channelSet, value]` in that order (confirmed against a live 10.3 board's `GET api/fppd/testing/tests/<pattern>`):
  - **interval:** milliseconds, 100 to 10000, default 1000.
  - **`RGB Single Color`:** the value is a hex color with a leading `#` (default `#FFFFFF`).
  - **`RGB Chase` and `RGB Cycle`:** the value is one of `R-G-B`, `R-G-B-W`, `R-G-B-All`, `R-G-B-W-All`, `R-G-B-None`, `R-G-B-W-None`, `R-G-B-All-None`, `R-G-B-W-All-None`.
  - **channelSet:** ranges written `start-end` (1-based, inclusive) or a single channel, **separated by `;`**. Do not use commas. A code comment in FPP master says only `;` was parsed until recently, and whether the 10.3 boards accept commas is unverified. A comma-separated list on an older fppd would silently light only the first range.
- **Why channel ranges can work here:** the FPP code comment saying a per-port test "cannot be done via channel ranges" is about FPP's own Output Specific test, where several strings can point at the same channels. The channel test lights channels, so it separates ports exactly when ports do not share channels. That is why the overlap warning exists.
- **Current test:** `GET api/fppd/testing` returns `{"Status":"OK","config":{...},"respCode":200}`. With no test running, `config` is just `{"enabled":0}` (seen on a live 10.3 board). With a test running it carries that test's settings, including `channelSet`. FPP's own status already reads "testing" while any test runs.
- **Do not use** the `Output Specific` test effect. That is the core Pixel Strings test and it does not take a port list.

## My calls (not yet agreed by Neil)

- **Nothing ticked by default.** Picking a pattern with nothing ticked starts nothing and shows a "Tick at least one port" hint, so ticking all 48 ports can never light by accident.
- **Ticks update a running test immediately.** Changing a tick while a test runs re-issues it with the new channels; unticking the last port stops the test.
- **The test keeps running if the page is closed or the phone locks,** because the intended use is walking out to the props with a phone. Stop is the Off choice, unticking everything, or FPP's own Test Stop. On load the page picks up a running test it recognises. If a test is running that the page could not have produced (a different effect, or channels that are not whole ports), it says so with a Stop button and does not take it over.
- **Patterns in v1:** Solid color (the `RGB Single Color` effect, with a color picker), RGB Chase and RGB Cycle. The default solid color is a dim white, not full white, because many ports lit at full white can draw a lot of current.
- **Ports with zero pixels are shown but cannot be ticked,** with a hint to set a pixel count on the Pixel Strings page.
- **Overlap warning.** If a ticked port shares channels with another port, flag it in the table, because the other port will light too.
- **Phone-friendly.** Tapping anywhere on a row toggles it, with large tap targets (plugin guideline 8.4).
- **Naming and layout:** plugin name "Port Test", `repoName` `fpp-porttest`, GitHub repo `heffneil/fpp-porttest`, local folder `/Users/neilheuer/claude-code/fpp-plugin-PortTest`, same layout as the fpp-movingheads plugin (pluginInfo.json, menu.inc, page, about page, lib/, assets/, harness/, scripts/, icon.png, README, GPL-2.0 LICENSE).
- **Minimum FPP version 10.0** (the version his boards run, and what his moving head plugin declares).
- **Bootstrap's own `table-success` row class for the tint,** no custom colors, so it follows FPP's light and dark themes.
- **Dim white is `#404040`** (about 25%).
- **Re-issuing a test when ticks change:** send `Test Start` again with the new channel set and do not send `Test Stop` in between. FPP reconfigures a running test in place when the channel set changes, so there is no flicker. Debounce taps by about 300 ms and allow only one request in flight, always sending the latest selection.
- **Recognising a running test on page load:** accept it only if the effect is `RGB Single Color`, `RGB Chase` or `RGB Cycle` and its channel set, expanded to individual channels, is exactly the union of whole ports. Compare channel sets, not range strings, so merged ranges across adjacent ports are not a problem. The ticked ports are the ports whose channels are all in the set. Restore the pattern dropdown and the color from the test's settings. Anything else gets the "a different test is running" notice with a Stop button.
- **A port with several strings:** show the lowest start channel, the highest end channel, the total pixel count, the first protocol and the first non-empty description. Its channels are still the union of the strings' ranges. Label ports with the port number plus one, which is FPP's own fallback; FPP's page can show cape-specific labels and v1 does not replicate those.
- **Which config to read:** the same rule FPP's own page uses. A BeagleBone platform (`BeaglePlatform`) reads `co-bbbStrings`, otherwise `co-pixelStrings`. If that output is missing or disabled, the page shows "No pixel string output is configured on this board."

## Constraints

- No change to fppd and none to FPP's own pages. Must leave FPP's own Testing dropdown untouched.
- Works on every pixel board type FPP supports (BeagleBone Black, PocketBeagle 2, Pi).
- No external network access, no data collected: privacy block with empty sends, collects and sensors, remoteAccess none, systemChanges none, closedCode false.
- Must follow the FPP plugin guidelines: theme-aware, no hardcoded colors, Bootstrap, responsive, touch-friendly.
- The channel test affects the board's channel data, so every output reading those channels sees it. That is expected.

## Acceptance: proof on real hardware

An off-device preview with a mocked API proves only what the mock assumes. The `--ALL--` episode on the Current Monitor page passed completely in a mock and was wrong on a real controller. So acceptance is on hardware, on one BeagleBone Black board and one PocketBeagle 2 board, each set to 800 pixels per port:

- Ticking one port lights only that port's props and every other port stays dark.
- Ticking several lights exactly those.
- Changing ticks while a test runs updates the lit ports within a couple of seconds.
- The page reflects a test already running when it is opened.

## Non-goals

- Changing fppd or FPP's own Channel Outputs page.
- The pixel-string-specific patterns (Port Number, Pixel Count by Port/String, the fades).
- Lighting ports that have no pixel count.
- The "only" link, multi-board (multisync) testing, saved selections or presets.
- An automatic timeout. A plugin has no background process, so a self-stop could only work while the page is open. Neil: a test stays on until he turns it off. The safeguards are the dim default color and FPP's own "testing" status.
- LED panel, PWM, serial or DMX outputs.
- Listing in the official plugin list. That is a later, separate step, but the manifest should be listing-ready.

## Anti-goals (failures even if it technically works)

- Lighting more than the ticked ports.
- A test left running unnoticed with many ports at full white.
- Disturbing FPP's own tests or any other plugin's test.

## Left to the builder

File split and code structure; how to recognise and label smart-receiver ports (verify the channel test lights them on a K32-Max with a receiver if one is available); color-picker and pattern UI details; how to parse and merge ranges; how often to refresh; wording of messages; the icon.

## Known unknowns to settle by experiment

- **Step 1 of the plan is a hardware spike, before any page work.** On one real board, run `Test Start` over two non-adjacent port ranges joined with `;` and confirm only those two ports light. Nobody has proved this on a board yet. Neil chose 172.16.0.52 and should be there to watch, because it lights real pixels.
- Whether the channel test lights outputs on a remote-mode board with an idle player (assumed yes, because FPP's own pixel test works on remotes).
- Whether ports whose strings share channels behave as the overlap warning assumes.

## Getting it onto a board

- **Install through the Plugin Manager from a GitHub repo.** Key-based SSH to the boards is not set up (`.52` refuses it), so files are not copied in by hand. `.52` can reach GitHub (checked by fetching a manifest from it).
- **Pasting a URL into the Plugin Manager search box only works at UI Level 3 (Developer).** `.52` is at level 1, so that setting has to be raised on the board first.
- **Creating the GitHub repo (`heffneil/fpp-porttest`) is a publishing step for Neil to approve when the plugin is ready to install.**

## Changes while planning (2026-11-06)

Made after approval, while writing the implementation plan. Each one is a plan decision for Neil to veto.

- **Ranges are joined with `;`.** "How it works" still said commas in one bullet, contradicting the `;` decision in the next. Fixed.
- **Group count formula.** FPP maps each group of pixels to one node (`PixelString.cpp`), so a string uses ceil(pixelCount ÷ groupCount) nodes. This equals the Pixel Strings page's End Channel only for evenly divisible counts.
- **Port labels are the port number plus one in v1.** Cape-specific labels are not replicated.
- **No icon in v1.** The Plugin Manager will show initials. An icon comes with listing.
- **Default branch is `main`** (so the manifest says `"branch": "main"`).
- **Uninstall sends `Test Stop`,** because removing the page removes the only Off control and a lit test would otherwise stay lit.
