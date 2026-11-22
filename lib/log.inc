<?php
/* fpp-porttest runtime log. Pure functions so they can be tested outside FPP. */

const PORTTEST_LOG_NAME = 'plugin-fpp-porttest.log';
const PORTTEST_LOG_MAX = 262144; // bytes; past this the log rolls to .1
const PORTTEST_MARKER = 'plugin.fpp-porttest.channeltest';

/* Appends "<date> <event> <detail>" to the plugin log and, for the two channel
 * test events, sets or clears the marker file the uninstall script reads (it
 * stops FPP's channel test only when Port Test started it). Returns false for an
 * event name it will not accept. */
function porttest_log_write($logDir, $mediaDir, $event, $detail)
{
    if (!is_string($event) || !preg_match('/^[a-z_]{1,32}$/', $event)) {
        return false;
    }
    $detail = is_string($detail) ? $detail : '';
    $detail = preg_replace('/[\x00-\x1f\x7f]+/', ' ', $detail);
    $detail = substr($detail, 0, 200);

    $file = rtrim($logDir, '/') . '/' . PORTTEST_LOG_NAME;
    if (is_file($file) && filesize($file) > PORTTEST_LOG_MAX) {
        @rename($file, $file . '.1');
    }
    $line = date('Y-m-d H:i:s') . ' ' . $event . ($detail !== '' ? ' ' . $detail : '') . "\n";
    $ok = @file_put_contents($file, $line, FILE_APPEND | LOCK_EX) !== false;

    $marker = rtrim($mediaDir, '/') . '/config/' . PORTTEST_MARKER;
    if ($event === 'channel_test_on') {
        @touch($marker);
    } elseif ($event === 'channel_test_off') {
        @unlink($marker);
    }
    return $ok;
}
