<?php

# Menu entries for fpp-porttest. At most one entry per menu area: Status/Control
# and Input/Output Setup (the same page, since it lights outputs), and Help.

$menuEntries = Array(
	Array(
		'text' => 'Port Test',
		'type' => 'status',
		'page' => 'status.php',
		'wrap' => 1
	),
	Array(
		'text' => 'Port Test',
		'type' => 'output',
		'page' => 'status.php',
		'wrap' => 1
	),
	Array(
		'text' => 'Port Test - Help',
		'type' => 'help',
		'page' => 'about.php',
		'wrap' => 1
	)
);

##############################################################################
# Display the menu entries for this plugin.
#
# FPP sets two variables before including this file, once per menu:
# $plugin - the plugin's directory/repoName
# $menu   - the menu area (status/content/output/help)
# It shows whatever is printed here, so defining $menuEntries alone puts the
# plugin in no menu at all.
foreach ($menuEntries as $entry)
{
	if ($entry['type'] != $menu)
		continue;

	if (preg_match('/^http.?:\/\//', $entry['page']))
	{
		printf("<li><a href='%s' target='_blank'>%s</a></li>\n",
			$entry['page'], $entry['text']);
	}
	else
	{
		$nopage = '';
		if (isset($entry['wrap']) && ($entry['wrap'] == 0))
			$nopage = '&nopage=1';

		printf("<li><a href='plugin.php?plugin=%s&page=%s%s'>%s</a></li>\n",
			$plugin, $entry['page'], $nopage, $entry['text']);
	}
}
?>
