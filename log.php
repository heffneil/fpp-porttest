<?php
/**
 * fpp-porttest - runtime log endpoint.
 *
 * Reached as plugin.php?plugin=fpp-porttest&page=log.php&nopage=1. The page
 * script POSTs one event; it is appended to <logDirectory>/plugin-fpp-porttest.log.
 */
require_once __DIR__ . '/lib/log.inc';

header('Content-Type: text/plain');
if (($_SERVER['REQUEST_METHOD'] ?? '') !== 'POST') {
    http_response_code(405);
    echo 'POST only';
    return;
}
$body = json_decode((string) file_get_contents('php://input'), true);
$ok = is_array($body) && porttest_log_write(
    $settings['logDirectory'] ?? '/home/fpp/media/logs',
    $settings['mediaDirectory'] ?? '/home/fpp/media',
    $body['event'] ?? null,
    $body['detail'] ?? ''
);
if (!$ok) {
    http_response_code(400);
}
echo $ok ? 'ok' : 'not logged';
