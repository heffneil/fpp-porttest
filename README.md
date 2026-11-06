# Port Test

An [FPP](https://github.com/FalconChristmas/fpp) plugin for finding out which props are on which pixel port.

Tick the ports you want, choose a test, and only those ports light. It uses FPP's own channel test, so nothing is stored and no sequence or configuration changes. This is handy at commissioning time, when props are not assigned in xLights yet and there is nothing to send channel data to. Give every port 800 pixels on the Pixel Strings page, then turn ports on and off one at a time.

## Install

In FPP, open **Content Setup → Plugin Manager**, paste this into the search box and install:

    https://raw.githubusercontent.com/heffneil/fpp-porttest/main/pluginInfo.json

(Pasting a URL there needs the UI level set to *Developer*. Once the plugin is in FPP's own list that is no longer needed.)

Port Test appears under **Status/Control**.

## Use

1. Open **Status/Control → Port Test**. Every pixel-string port is listed with its channels and pixel count.
2. Tick the ports you want. The checkbox in the header selects all of them. Tapping anywhere on a row ticks it.
3. Pick a pattern next to **Testing:** (Solid color, RGB Chase or RGB Cycle). Ticked ports light and turn green in the list; the status reads "Testing N of M ports".
4. Tick or untick ports while it runs and the lit set follows. Choose **Off** to stop.

A test stays lit until you turn it off. Reloading the page does not stop it, and the page picks it up again when it loads.

## Limits

- It runs channel patterns only. FPP's pixel-string tests (Port Number, Pixel Count and the fades) cannot be limited to chosen ports.
- Ports must not share channels. If two do, lighting one lights the other; the page flags this with a badge.
- Cape port labels (such as "P1-3") are not shown. Ports are numbered 1 upwards.
- A port with no pixels cannot be ticked. Set a pixel count on the Pixel Strings page.
- Tested on a BeagleBone Black (FPP 10.3). Pi boards use `co-pixelStrings` and are untested.

## Privacy

Nothing is sent anywhere and nothing is collected. The plugin talks only to FPP on the same device.

## Development

    node --test "tests/*.test.js"
    php -S 127.0.0.1:8146 -t harness harness/preview.php

See `harness/README.md`. A mock proves only what it assumes, so changes are checked on a real board; results are in `docs/`.

## License

GPL-2.0, like FPP.
