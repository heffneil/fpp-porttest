# Off-device preview harness

Runs the real `status.php` without an FPP device. FPP is stubbed and the
pixel-string config comes from a fixture.

    php -S 127.0.0.1:8146 -t harness harness/preview.php

Open <http://127.0.0.1:8146/>.

- `/harness/fixture?name=normal|edge|disabled` picks the board layout
  (48 plain ports; hostile description, zero-pixel, overlap, multi-string and
  RGBW ports; output disabled).
- `/requests` lists every API request the page made; `/reset` clears it.
- `PT_THEME=light|dark` (default dark) sets the Bootstrap theme.

Bootstrap comes from `harness/.preview-media/bootstrap.min.css` (gitignored), a
copy of FPP's own `www/css/fpp-bootstrap/dist/fpp-bootstrap-5-3.css`:

    mkdir -p harness/.preview-media
    cp /path/to/fpp/www/css/fpp-bootstrap/dist/fpp-bootstrap-5-3.css harness/.preview-media/bootstrap.min.css

A mock proves only what it assumes. The real checks are on a board.
