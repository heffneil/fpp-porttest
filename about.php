<?php /* fpp-porttest help page. Included inside FPP's page chrome. */ ?>
<div class="container-fluid">
	<h2>Port Test</h2>
	<p>Port Test lists your pixel-string ports. Tick the ports you want and press the test button: only those ports light, using FPP's own channel test. Use the header checkbox to select every port.</p>
	<h3>Patterns</h3>
	<p><b>Solid color</b> lights every ticked port completely. <b>Port number</b> lights the first N pixels of each ticked port, where N is the port number, so port 1 lights 1 pixel and port 5 lights 5: count the lit pixels to read the port. <b>RGB Chase</b> and <b>RGB Cycle</b> run FPP's chase and cycle over the ticked ports.</p>
	<h3>Tip: commissioning</h3>
	<p>Before props are assigned in xLights, give every port 800 pixels on the Pixel Strings page. Then each port can be turned on alone to see which prop is connected to it.</p>
	<h3>Stays lit until you turn it off</h3>
	<p>A test has no timeout. It runs until you press Off, so remember to stop it.</p>
	<h3>Shared channels</h3>
	<p>The test works on channels. If two ports share channels, lighting one also lights the other; the page flags such overlaps.</p>
</div>
