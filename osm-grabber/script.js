L_PREFER_CANVAS = true;

var map,
	mapWidth = 0,
	mapHeight = 0,
	$coordEl;

var moveMap = function(dir) {
	var target,
		vector,
		current = map.latLngToLayerPoint(map.getCenter());

	switch (dir) {
		case 'up':
		case 'down':
			vector = L.point(0, mapHeight);
			break;
		case 'left':
		case 'right':
			vector = L.point(mapWidth, 0);
	}

	if (dir == 'up' || dir == 'left')
		target = current.subtract(vector);
	else
		target = current.add(vector);

	map.setView(map.layerPointToLatLng(target), map.getZoom());
};

var updateCoords = function() {
	var b = map.getBounds(),
		nw = b.getNorthWest(),
		se = b.getSouthEast(),
		projectedNw = ol.proj.fromLonLat([nw.lng, nw.lat]),
		projectedSe = ol.proj.fromLonLat([se.lng, se.lat]);

	var mergedCoords = [projectedSe[0], projectedNw[1], projectedNw[0], projectedSe[1]];

	var object = {
		url: '',
		coordinates: mergedCoords,
		imageSize: [mapWidth, mapHeight],
		maxzoomLevel: map.getZoom() - 2,
		minzoomLevel: 0
	};

	$coordEl.val(JSON.stringify(object));
};

function initMap() {
	// set up the map
	map = new L.Map('mapContainer');
	var tileUrl = "http://{s}.tile.openstreetmap.fr/hot/{z}/{x}/{y}.png";
	var osm = new L.TileLayer(tileUrl, {subdomains: 'ab', maxNativeZoom: 19, maxZoom: 19});

	map.setView(new L.LatLng(46.9479740, 7.4474470), 15);
	map.addLayer(osm);

	mapWidth = $('#mapContainer').width();
	mapHeight = $('#mapContainer').height();
	$coordEl = $('.coord-string');

	updateCoords();
	bindHandlers();
}

var bindHandlers = function() {
	$('.mover').on('click', function(e) {
		e.preventDefault();
		moveMap($(this).data('direction'));
	});

	$('.export').on('click', function(e) {
		e.preventDefault();
		var $self = $(this);
		$self.prop('disabled', true);

		leafletImage(map, function(err, canvas) {

			Canvas2Image.saveAsPNG(canvas);
			$self.prop('disabled', false);
		});
	});

	$('.copy').on('click', function(e) {
			e.preventDefault();
		  $coordEl.select();

		  try {
		    var successful = document.execCommand('copy');
		    var msg = successful ? 'successful' : 'unsuccessful';
		    console.log('Copying text command was ' + msg);
		  } catch (err) {
		    console.log('Oops, unable to copy');
		  }
	});

	map.on('moveend', updateCoords);
};

$(function() {
	initMap();
});
