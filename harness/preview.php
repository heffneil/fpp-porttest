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
 *   GET /harness/seed?name=none|ports2and5|other    set what test is "running"
 *   GET /harness/seed?name=effect                    an effect file of ours "already playing"
 *   GET /harness/fail?on=1|0                         make POST /api/command answer 500
 *   GET /harness/noplay?on=1|0                       FSEQ Effect Start answers but never plays
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
$TESTING_FILE = $WORK . '/testing.json';
$FAIL_FILE = $WORK . '/fail';
$SEQ_DIR = $WORK . '/sequences';
$EFFECTS_FILE = $WORK . '/effects.json';
$NOPLAY_FILE = $WORK . '/noplay';
@mkdir($SEQ_DIR, 0777, true);

function runningEffects()
{
    global $EFFECTS_FILE;
    $list = is_readable($EFFECTS_FILE) ? json_decode((string) file_get_contents($EFFECTS_FILE), true) : [];
    return is_array($list) ? array_values($list) : [];
}
function setRunningEffects($list)
{
    global $EFFECTS_FILE;
    file_put_contents($EFFECTS_FILE, json_encode(array_values($list)));
}
function seqPath($name)
{
    global $SEQ_DIR;
    return $SEQ_DIR . '/' . basename($name);
}

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

function testingConfig()
{
    global $TESTING_FILE;
    $raw = is_readable($TESTING_FILE) ? file_get_contents($TESTING_FILE) : '';
    $cfg = json_decode($raw, true);
    return is_array($cfg) ? $cfg : ['enabled' => 0];
}

// Mirrors ChannelTester.cpp mapSubMode / mapPattern for RGB Chase and Cycle.
function chaseSubMode($type)
{
    $map = ['R-G-B-All' => 'RGBA', 'R-G-B-None' => 'RGBN', 'R-G-B-All-None' => 'RGBAN',
        'R-G-B-W' => 'RGBW', 'R-G-B-W-All' => 'RGBWA', 'R-G-B-W-None' => 'RGBWN', 'R-G-B-W-All-None' => 'RGBWAN'];
    return $map[$type] ?? 'RGB';
}
function chasePattern($type)
{
    $map = [
        'R-G-B-All' => 'FF000000FF000000FFFFFFFF',
        'R-G-B-None' => 'FF000000FF000000FF000000',
        'R-G-B-All-None' => 'FF000000FF000000FFFFFFFF000000',
        'R-G-B-W' => 'FF00000000FF00000000FF00000000FF',
        'R-G-B-W-All' => 'FF00000000FF00000000FF00000000FFFFFFFFFF',
        'R-G-B-W-None' => 'FF00000000FF00000000FF00000000FF00000000',
        'R-G-B-W-All-None' => 'FF00000000FF00000000FF00000000FFFFFFFFFF00000000',
    ];
    return $map[$type] ?? 'FF000000FF000000FF';
}

if ($uri === '/harness/seed') {
    $name = $_GET['name'] ?? '';
    header('Content-Type: text/plain');
    if ($name === 'effect') {
        // Port Number on ports 3 and 6, as the page names its files.
        file_put_contents(seqPath('porttest_pn_3_6.fseq'), 'x');
        setRunningEffects(['porttest_pn_3_6']);
        file_put_contents($TESTING_FILE, json_encode(['enabled' => 0]));
        echo "seed: effect\n";
        exit;
    }
    $seeds = [
        'none' => ['enabled' => 0],
        // Ports labelled 2 and 5 on the normal fixture, in the shape of tests/fixtures/testing-running-fill.json.
        'ports2and5' => ['channelSet' => '2401-4800;9601-12000', 'channelSetType' => 'channelRange',
            'channelsPerNode' => 3, 'color1' => 64, 'color2' => 64, 'color3' => 64, 'colorPattern' => '',
            'cycleMS' => 1000, 'enabled' => 1, 'mode' => 'RGBFill'],
        'other' => ['enabled' => 1, 'mode' => 'Outputs', 'outputs' => 'BBB Pixel Strings', 'type' => 1],
    ];
    if (!isset($seeds[$name])) {
        http_response_code(400);
        echo "unknown seed; use none, ports2and5 or other\n";
        exit;
    }
    file_put_contents($TESTING_FILE, json_encode($seeds[$name]));
    echo "seed: $name\n";
    exit;
}

if ($uri === '/harness/fail') {
    file_put_contents($FAIL_FILE, ($_GET['on'] ?? '0') === '1' ? '1' : '0');
    header('Content-Type: text/plain');
    echo "fail: " . (($_GET['on'] ?? '0') === '1' ? 'on' : 'off') . "\n";
    exit;
}

if ($uri === '/harness/noplay') {
    file_put_contents($NOPLAY_FILE, ($_GET['on'] ?? '0') === '1' ? '1' : '0');
    header('Content-Type: text/plain');
    echo "noplay: " . (($_GET['on'] ?? '0') === '1' ? 'on' : 'off') . "\n";
    exit;
}

if (str_starts_with($uri, '/api/')) {
    $raw = $_SERVER['REQUEST_METHOD'] === 'POST' ? file_get_contents('php://input') : '';
    $isFile = str_starts_with($uri, '/api/file/');
    file_put_contents($LOG, $_SERVER['REQUEST_METHOD'] . ' ' . $_SERVER['REQUEST_URI']
        . ($isFile ? ($raw !== '' ? ' (' . strlen($raw) . ' bytes)' : '') : ($raw !== '' ? ' ' . $raw : '')) . "\n", FILE_APPEND);

    // Sequence files: what FPP's /api/file/sequences/<name> does.
    if (preg_match('#^/api/file/sequences/([^/]+)$#', $uri, $m)) {
        header('Content-Type: application/json');
        $name = urldecode($m[1]);
        if ($_SERVER['REQUEST_METHOD'] === 'POST') {
            file_put_contents(seqPath($name), $raw);
            echo json_encode(['status' => 'OK', 'file' => $name, 'dir' => 'sequences', 'written' => (string) strlen($raw)]);
            exit;
        }
        if ($_SERVER['REQUEST_METHOD'] === 'DELETE') {
            @unlink(seqPath($name));
            echo json_encode(['status' => 'OK', 'file' => $name, 'dir' => 'sequences']);
            exit;
        }
    }

    if ($_SERVER['REQUEST_METHOD'] === 'POST' && $uri === '/api/command') {
        // FPP answers text/plain: 200 on success, 500 with the message on error.
        header('Content-Type: text/plain');
        if (is_readable($FAIL_FILE) && trim((string) file_get_contents($FAIL_FILE)) === '1') {
            http_response_code(500);
            echo "failed on purpose (harness)";
            exit;
        }
        $cmd = json_decode($raw, true);
        $args = is_array($cmd) ? ($cmd['args'] ?? []) : [];
        if (($cmd['command'] ?? '') === 'FSEQ Effect Start') {
            // FPP says "Effect Started" even when it cannot open the file; it only plays if it can.
            $name = (string) ($args[0] ?? '');
            $noplay = is_readable($NOPLAY_FILE) && trim((string) file_get_contents($NOPLAY_FILE)) === '1';
            if (!$noplay && is_file(seqPath($name . '.fseq')) && !in_array($name, runningEffects(), true)) {
                setRunningEffects(array_merge(runningEffects(), [$name]));
            }
            echo 'Effect Started';
            exit;
        }
        if (($cmd['command'] ?? '') === 'Effect Stop') {
            $name = (string) ($args[0] ?? '');
            setRunningEffects(array_filter(runningEffects(), function ($n) use ($name) { return $n !== $name; }));
            echo 'Effect Stopped';
            exit;
        }
        if (($cmd['command'] ?? '') === 'Test Stop') {
            file_put_contents($TESTING_FILE, json_encode(['enabled' => 0]));
            echo 'Test Stopped';
            exit;
        }
        if (($cmd['command'] ?? '') === 'Test Start') {
            $cfg = ['enabled' => 1, 'cycleMS' => (int) ($args[0] ?? 1000), 'colorPattern' => '',
                'channelSet' => (string) ($args[2] ?? ''), 'channelSetType' => 'channelRange'];
            $effect = $args[1] ?? '';
            if ($effect === 'RGB Single Color') {
                $v = hexdec(ltrim((string) ($args[3] ?? '#000000'), '#'));
                $cfg += ['mode' => 'RGBFill', 'channelsPerNode' => 3,
                    'color1' => ($v >> 16) & 255, 'color2' => ($v >> 8) & 255, 'color3' => $v & 255];
            } elseif ($effect === 'RGB Chase' || $effect === 'RGB Cycle') {
                $mode = $effect === 'RGB Chase' ? 'RGBChase' : 'RGBCycle';
                $type = (string) ($args[3] ?? 'R-G-B');
                $cfg += ['mode' => $mode, 'subMode' => $mode . '-' . chaseSubMode($type),
                    'channelsPerNode' => strpos($type, 'W') !== false ? 4 : 3];
                $cfg['colorPattern'] = chasePattern($type);
            } else {
                http_response_code(500);
                echo 'Unsupported test: ' . $effect;
                exit;
            }
            file_put_contents($TESTING_FILE, json_encode($cfg));
            echo 'Test Started';
            exit;
        }
        echo 'OK';
        exit;
    }

    header('Content-Type: application/json');
    if ($_SERVER['REQUEST_METHOD'] === 'GET' && $uri === '/api/fppd/effects') {
        $out = [];
        foreach (runningEffects() as $i => $n) {
            $out[] = ['id' => $i, 'name' => $n];
        }
        echo json_encode(['Status' => 'OK', 'Message' => '', 'respCode' => 200, 'runningEffects' => $out]);
        exit;
    }
    if ($_SERVER['REQUEST_METHOD'] === 'GET' && $uri === '/api/sequence') {
        $names = [];
        foreach (glob($SEQ_DIR . '/*.fseq') as $f) {
            $names[] = basename($f, '.fseq');
        }
        echo json_encode($names);
        exit;
    }
    if ($_SERVER['REQUEST_METHOD'] === 'GET' && $uri === '/api/fppd/testing') {
        echo json_encode(['Status' => 'OK', 'config' => testingConfig(), 'respCode' => 200]);
        exit;
    }
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
    foreach (glob($SEQ_DIR . '/*') as $f) {
        @unlink($f);
    }
    @unlink($EFFECTS_FILE);
    @unlink($NOPLAY_FILE);
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
