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
