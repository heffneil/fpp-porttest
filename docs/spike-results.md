# Multi-range hardware spike: results

Date: 2026-11-06. Script: `scripts/dev/spike_multirange.py`.

## Question

Does FPP's channel test, given two port ranges joined by `;`, light only those two ports on a real board?

## Board

172.16.0.52, Kulp32-LEFT-SIDE-OF-DOOR: BeagleBone Black (K32A-B), FPP 10.3, remote mode, 48 ports at 800 RGB pixels each, no two ports sharing channels. Neil was at the board.

## What was sent

`POST /api/command`, `Test Start` with `["1000", "RGB Single Color", "207209-209608;214409-216808", "#404040"]`: port 2 (207209-209608) and port 5 (214409-216808), dim white.

## Result: pass

Neil's report: "yes 2 and 5 are on", and when asked whether the other ports were dark: "the others were dark". Only the two ports lit.

The board's own status while it ran (saved as `tests/fixtures/testing-running-fill.json`):

```json
{"Message":"","Status":"OK","config":{"channelSet":"207209-209608;214409-216808","channelSetType":"channelRange","channelsPerNode":3,"color1":64,"color2":64,"color3":64,"colorPattern":"","cycleMS":1000,"enabled":1,"mode":"RGBFill"},"respCode":200}
```

`Test Stop` returned the config to `{"enabled":0}`.

## Not run

The optional check of whether 10.3 accepts commas as the separator was not run. The plugin uses `;` either way.

## Also captured

At Neil's request FPP's own Port Number test (`Test Start` with `["2000","Output Specific","BBB Pixel Strings","1"]`, the same command the Pixel Strings page's Testing dropdown sends) was run on the same board. It lit every port. Its status is saved as `tests/fixtures/testing-running-output-specific.json`; it has no `channelSet`, so the plugin must treat it as "a different test is running" (Task 5 and the Task 8 harness use it).

## Findings that affect later tasks

- FPP's API returns HTTP 404 for a GET that carries a `Content-Type` header (no header: 200; `application/json`: 404).
- `POST /api/command` accepts form-urlencoded, `text/plain` and `application/json` bodies (checked with a no-op `Test Stop`).

## Correction (found on .56, after the plugin shipped)

FPP stores each string's `startChannel` **0-based** in the saved config (`vs.startChannel = row value - 1` in `www/co-pixelStrings.php`, shown +1). The spike script and the first plugin build treated it as 1-based, so every channel set was one channel early. A dim solid colour hid this (the multi-range finding above still holds). It surfaced with the Port number pattern: on .56 port 1's start is stored as `0`, so it sent channel `0-2`, which does not exist. Fixed in `stringRange` (`channel = startChannel + 1`) with tests that feed 0-based config values.
