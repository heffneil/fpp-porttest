<?php
/**
 * Off-device preview harness for the Port Test page.
 *
 * Stands in for FPP: provides $settings, wraps status.php the way plugin.php
 * would, serves the pixel-string config from a fixture, and logs every API
 * request the page makes.
 *
 *   php -S 127.0.0.1:8146 -t harness harness/preview.php
 *
 *   GET /harness/fixture?name=normal|edge|disabled   choose the board layout
 *   GET /requests                                    every API request, newest last
 *   GET /reset                                       clear the log
 *
 * A mock proves only what it assumes: real behaviour is checked on a board.
 */

$ROOT = dirname(__DIR__);
$WORK = $ROOT . '/harness/.preview-media';
@mkdir($WORK, 0777, true);
$LOG = $WORK . '/requests.log';
$FIXTURE_FILE = $WORK . '/fixture';

$FIXTURES = [
    'normal' => 'co-bbbStrings.json',
    'edge' => 'co-bbbStrings-edge.json',
    'disabled' => 'co-bbbStrings-disabled.json',
];

// ---- stand in for FPP ------------------------------------------------------
$settings = [
    'mediaDirectory' => $WORK,
    'BeaglePlatform' => 'BeagleBone Black',
];

$uri = parse_url($_SERVER['REQUEST_URI'], PHP_URL_PATH);

function chosenFixture()
{
    global $FIXTURE_FILE, $FIXTURES;
    $name = is_readable($FIXTURE_FILE) ? trim((string) file_get_contents($FIXTURE_FILE)) : 'normal';
    return isset($FIXTURES[$name]) ? $name : 'normal';
}

if ($uri === '/harness/fixture') {
    $name = $_GET['name'] ?? '';
    header('Content-Type: text/plain');
    if (!isset($FIXTURES[$name])) {
        http_response_code(400);
        echo "unknown fixture; use normal, edge or disabled\n";
        exit;
    }
    file_put_contents($FIXTURE_FILE, $name);
    echo "fixture: $name\n";
    exit;
}

if (str_starts_with($uri, '/api/')) {
    file_put_contents($LOG, $_SERVER['REQUEST_METHOD'] . ' ' . $_SERVER['REQUEST_URI'] . "\n", FILE_APPEND);
    header('Content-Type: application/json');
    if ($_SERVER['REQUEST_METHOD'] === 'GET' && $uri === '/api/channel/output/co-bbbStrings') {
        readfile($ROOT . '/harness/fixtures/' . $FIXTURES[chosenFixture()]);
        exit;
    }
    http_response_code(404);
    echo json_encode(['Status' => 'ERROR', 'Message' => 'not mocked']);
    exit;
}

if ($uri === '/bootstrap.css') {
    if (is_readable($WORK . '/bootstrap.min.css')) {
        header('Content-Type: text/css');
        readfile($WORK . '/bootstrap.min.css');
    } else {
        http_response_code(404);
    }
    exit;
}
if ($uri === '/requests') {
    header('Content-Type: text/plain');
    if (is_readable($LOG)) {
        readfile($LOG);
    }
    exit;
}
if ($uri === '/reset') {
    @unlink($LOG);
    header('Content-Type: text/plain');
    echo "cleared\n";
    exit;
}

// ---- wrap the page the way plugin.php does ---------------------------------
$theme = getenv('PT_THEME') ?: 'dark';
echo "<!DOCTYPE html><html><head><meta charset='utf-8'>";
echo "<meta name='viewport' content='width=device-width, initial-scale=1'>";
echo "<title>Port Test preview</title>";
echo "<link rel='stylesheet' href='/bootstrap.css'>";
echo "<script>document.documentElement.setAttribute('data-bs-theme','" . htmlspecialchars($theme) . "');</script>";
echo "<style>body{margin:18px}</style>";
echo "</head><body>";
include $ROOT . '/status.php';
echo "</body></html>";
