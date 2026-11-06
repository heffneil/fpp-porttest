<?php
/**
 * fpp-porttest - Status/Control page.
 *
 * Included by FPP's plugin.php inside the usual header/menu/footer, so it must
 * not emit a document wrapper. Assets live in assets/ and are inlined, never put
 * in js/ or css/ (plugin.php serves those with an immutable cache header).
 */

$configFile = !empty($settings['BeaglePlatform']) ? 'co-bbbStrings' : 'co-pixelStrings';
$boot = ['configFile' => $configFile];
$flags = JSON_HEX_TAG | JSON_HEX_AMP | JSON_HEX_APOS | JSON_HEX_QUOT;
?>
<script>window.PORTTEST_CONFIG = <?php echo json_encode($boot, $flags); ?>;</script>
<div id="porttest"></div>
<?php
foreach (['core', 'updater', 'api', 'ui'] as $part) {
    if (is_readable(__DIR__ . '/assets/porttest-' . $part . '.js')) {
        echo "<script>\n";
        readfile(__DIR__ . '/assets/porttest-' . $part . '.js');
        echo "\n</script>\n";
    }
}
?>
<script>
(function () {
    var el = document.getElementById('porttest');
    if (typeof PortTestUI !== 'undefined' && typeof PortTestApi !== 'undefined') {
        PortTestUI.init(el, {configFile: window.PORTTEST_CONFIG.configFile, api: PortTestApi.createApi()});
    }
})();
</script>
