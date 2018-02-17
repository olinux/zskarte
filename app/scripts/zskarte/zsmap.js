/*
 * Copyright © 2015 Oliver Schmid
 *
 * This file is part of Zivilschutzkarte.
 *
 * Zivilschutzkarte is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * Zivilschutzkarte is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with Zivilschutzkarte.  If not, see <http://www.gnu.org/licenses/>.
 */

'use strict';

var initialCoordinates = [829038.2228723184,5933590.521128002];


var getCoordinatesProjection = function(){
    return ol.proj.get('EPSG:4326');
};

var getMercatorProjection = function(){
    return ol.proj.get('EPSG:3857');
};

var getSwissProjection = function(){
    return ol.proj.get('EPSG:21781');
};


function ZsMap(map, layers, projectionFunction) {
    var _this = this;
    this.map = map;
    this.layers = layers;
    this.projectionFunction = projectionFunction;
    for (var i=0; i<this.layers.length; i++) {
        var l = this.layers[i];
        for(var i2=0; i2<l.layers.length; i2++){
            this.map.addLayer(l.layers[i2]);
        }
    }

    this.jpgDownload = function (exportLink) {
        if ('download' in exportLink) {
            var url;
            _this.map.once('postcompose', function (event) {
                var canvas = event.context.canvas;
                exportLink.href = canvas.toDataURL('image/jpeg');
            });
            _this.map.renderSync();

        } else {
            window.alert('Download not supported');
        }
    };

    this.gotoCoordinates = function(lon, lat){
        var coordinates= ol.proj.transform([lon, lat], getCoordinatesProjection(), _this.projectionFunction());
        _this.map.getView().setCenter(coordinates);
    };

    this.providerList = ['offline', 'osm', 'geoadmin'];
    this.providerList.splice( this.providerList.indexOf(mapprovider), 1 );
}

function createOfflineMap($http, callback){
    var map = new ol.Map({
        target: 'map',
        view: new ol.View({
            center: initialCoordinates,
            zoom: 15
        })
    });
    var layers = [];
    window.loadOfflineMaps = function(offlineMapResult){
        for(var i = 0; i<offlineMapResult.maps.length; i++){
            var offlineMap = offlineMapResult.maps[i];
            var images = [];
            for(var i2=0; i2<offlineMap.images.length; i2++){
                var image = offlineMap.images[i2];
                images.push(new OfflineMap(image.coordinates, image.imageSize, 'offlinemap/'+offlineMap.subfolder+'/'+image.url, image.minzoomLevel, image.maxzoomLevel).layer);
            }
            layers.push({'name': offlineMap.name, 'layers': images});
            callback(new ZsMap(map, layers, getMercatorProjection));

        }
    };
    $http.jsonp('offlinemap/offlinemap.jsonp');
}

function createOpenStreetMap(callback){
    var osm = new ol.layer.Tile({
        source: new ol.source.OSM()
    });
    var map = new ol.Map({
        target: 'map',
        view: new ol.View({
            center: initialCoordinates,
            zoom: 16
        })
    });
    var layers = [];
    var road = new ol.layer.Tile({
        style: 'Road',
        source: new ol.source.MapQuest({layer: 'osm'})
    });
    var aerial = new ol.layer.Tile({
        style: 'Aerial',
        visible: false,
        source: new ol.source.MapQuest({layer: 'sat'})
    });
    var aerialWithLabels= new ol.layer.Group({
        style: 'AerialWithLabels',
        visible: false,
        layers: [
            new ol.layer.Tile({
                source: new ol.source.MapQuest({layer: 'sat'})
            }),
            new ol.layer.Tile({
                source: new ol.source.MapQuest({layer: 'hyb'})
            })
        ]
    });
    layers.push({'name': 'Open Street Map', 'layers': [osm]});
    layers.push({'name': 'MapQuest road', 'layers': [road]});
    callback(new ZsMap(map, layers, getMercatorProjection));
}
function createGeoAdminMap(callback){
    var map = new ga.Map({
        target: 'map',
        view: new ol.View({
            projection: 'EPSG:21781',
            center: ol.proj.transform(initialCoordinates, getMercatorProjection(), getSwissProjection()),
            zoom: 15
        })
    });
    var layers = [];
    var pixelkarte = ga.layer.create('ch.swisstopo.pixelkarte-farbe');
    pixelkarte.setOpacity(0.9);
    layers.push({'name': 'Pixelkarte', 'layers': [pixelkarte]});
    layers.push({'name': 'SwissIMAGE', 'layers': [ga.layer.create('ch.swisstopo.swissimage')]});
    layers.push({'name': 'IVS Geländekarte', 'layers': [ga.layer.create('ch.astra.ivs-gelaendekarte')]});
    //layers.push({'name': 'Strassennetz', 'layers': [ga.layer.create('ch.swisstopo.vec25-strassennetz')]});
    //layers.push({'name': '3D-Gebäude', 'layers': [ga.layer.create('ch.swisstopo.swissbuildings3d')]});
    layers.push({'name': 'Gemeindegrenzen', 'layers': [ga.layer.create('ch.swisstopo.swissboundaries3d-gemeinde-flaeche.fill')]});
    layers.push({'name': 'Hanglagen', 'layers': [ga.layer.create('ch.blw.hang_steillagen')]});


    callback(new ZsMap(map, layers, getSwissProjection));
}

function switchMapProvider(provider, $http, callback){
    switch (provider) {
        case 'offline':
            createOfflineMap($http, callback);
            break;
        case 'geoadmin':
            createGeoAdminMap(callback);
            break;
        default:
            createOpenStreetMap(callback);
            break;
    }
}


