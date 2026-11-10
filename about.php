<?php /* fpp-porttest help page. Included inside FPP's page chrome. */ ?>
<div class="container-fluid">
	<h2>Port Test</h2>
	<p>Port Test lists your pixel-string ports. Tick the ports you want and press the test button: only those ports light, using FPP's own channel test. Use the header checkbox to select every port.</p>
	<h3>Patterns</h3>
	<p>The first seven match the Testing menu on FPP's Pixel Strings page, and run only on the ticked ports.</p>
	<ul>
		<li><b>Port Number</b>: port N lights its first N pixels white, so port 1 lights 1 pixel and port 5 lights 5: count them to read the port. The rest of the port cycles red, green and blue.</li>
		<li><b>Pixel Count by Port</b> and <b>Pixel Count by String</b>: blocks of ten pixels in green, red and blue, with every 50th pixel white, so you can count the pixels on a port or on each string.</li>
		<li><b>Red, Green, Blue and White Fade</b>: the ticked ports fade up and down in that color.</li>
		<li><b>Solid color</b>, <b>RGB Chase</b> and <b>RGB Cycle</b> use FPP's channel test over the ticked ports.</li>
	</ul>
	<h3>Tip: commissioning</h3>
	<p>Before props are assigned in xLights, give every port 800 pixels on the Pixel Strings page. Then each port can be turned on alone to see which prop is connected to it.</p>
	<h3>Stays lit until you turn it off</h3>
	<p>A test has no timeout. It runs until you press Off, so remember to stop it. The first seven patterns play from a small temporary file in FPP's sequences folder; Off deletes it.</p>
	<h3>Shared channels</h3>
	<p>The test works on channels. If two ports share channels, lighting one also lights the other; the page flags such overlaps.</p>
</div>
