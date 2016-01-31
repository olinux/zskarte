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

/**
 * The draw layer allows us to draw new features onto the map.
 * @constructor
 */
function DrawLayer(selectionHandler) {
  var _this = this;
  this.draw = undefined;
  this.style = new DrawStyle();
  this.select = new ol.interaction.Select({
    toggleCondition: ol.events.condition.never,
    style: this.style.styleFunctionSelect,
    condition: ol.events.condition.never
  });
  this.selectionHandler = selectionHandler;
  this.modify = new ol.interaction.Modify({
    features: this.select.getFeatures()
  });
  this.selectionChanged = function () {
    if (_this.select.getFeatures().getLength() == 1) {
      _this.selectionHandler(_this.select.getFeatures().item(0));
    }
    else if (_this.select.getFeatures().getLength() == 0) {
      _this.selectionHandler(undefined);
    }
    else {
      alert("too many items selected at once!");
    }
  };
  this.source = new ol.source.Vector({
    format: new ol.format.GeoJSON()
  });
  this.layer = new ol.layer.Vector({
    source: this.source,
    style: this.style.styleFunction
  });
  this.drawer = undefined;
  this.map = undefined;

  this.source.on('addfeature', this.selectionChanged);

  this.selectorHandler = function (e) {
    _this.select.getFeatures().clear();
    var f = _this.source.getClosestFeatureToCoordinate(e.coordinate);
    var threshold = 40;
    var ext = f.getGeometry().getExtent();
    var vmax = Math.max(ext[1], ext[3]);
    var vmin = Math.min(ext[1], ext[3]);
    var hmax = Math.max(ext[0], ext[2]);
    var hmin = Math.min(ext[0], ext[2]);

    var select = false;
    //Is inside?
    var vdist = vmax - e.coordinate[1];
    var hdist = hmax - e.coordinate[0];

    if (vdist > 0 && hdist > 0 && vdist < vmax - vmin && hdist < hmax - hmin) {
      select = true;
    }
    else {
      var vdiff = Math.min(Math.abs(vmax - e.coordinate[1]), Math.abs(vmin - e.coordinate[1]));
      var hdiff = Math.min(Math.abs(hmax - e.coordinate[0]), Math.abs(hmin - e.coordinate[0]));
      if (hdiff < threshold && vdiff < threshold) {
        select = true;
      }
    }

    if (select) {
      _this.select.getFeatures().push(f);
    }
    else {
      _this.select.getFeatures().clear();
    }
    _this.selectionChanged();
  };

  this.initMap = function (map) {
    _this.map = map;
    _this.map.map.addInteraction(_this.select);
    _this.map.map.addInteraction(_this.modify);
    _this.map.map.on("click", _this.selectorHandler);
    _this.map.map.addLayer(_this.layer);
  };

  var writeFeatures = function () {
    var features = _this.source.getFeatures();
    for (var i = 0; i < features.length; i++) {
      var feature = features[i];
      var geometry = feature.getGeometry().transform(_this.map.projectionFunction(), getMercatorProjection());
      feature.setGeometry(geometry);
    }
    var json = JSON.stringify(new ol.format.GeoJSON({defaultDataProjection: 'EPSG:3857'}).writeFeatures(features));
    for (var i = 0; i < features.length; i++) {
      var feature = features[i];
      var geometry = feature.getGeometry().transform(getMercatorProjection(), _this.map.projectionFunction());
      feature.setGeometry(geometry);
    }

    return json;
  }

  this.toDataUrl = function () {
    return 'data:text/json;charset=UTF-8,' + encodeURIComponent(writeFeatures());
  };


  this.save = function () {
    var previouslyStored = localStorage.getItem("map");
    var now = writeFeatures();
    if (now !== previouslyStored) {
      localStorage.setItem("map", now);
      var history = localStorage.getItem("mapold");
      if (history === null) {
        history = {"elements": []};
      }
      else {
        history = JSON.parse(history);
      }
      history.elements.push({"time": new Date(), "content": now});
      localStorage.setItem("mapold", JSON.stringify(history));
    }
  };

  this.getFromHistory = function (date) {
    var history = localStorage.getItem("mapold");
    if (history !== null) {
      history = JSON.parse(history);
      for (var i = history.elements.length; i > 0; i--) {
        var element = history.elements[i - 1];
        if (date > element.time) {
          loadElements(element.content);
          break;
        }
      }
    }
  }

  this.loadFromString = function (text) {
    loadElements(JSON.parse(text));
  }

  var loadElements = function (elements) {
    _this.source.clear();
    _this.select.getFeatures().clear();
    if (elements !== null) {
      var features = new ol.format.GeoJSON().readFeatures(elements);
      for (var i = 0; i < features.length; i++) {
        var feature = features[i];
        var geometry = feature.getGeometry().transform(getMercatorProjection(), _this.map.projectionFunction());
        feature.setGeometry(geometry);
      }
      _this.source.addFeatures(features)
    }
  }

  this.load = function () {
    var items = localStorage.getItem("map");
    if (items !== null) {
      _this.loadFromString(items);
    }
  };

  this.startDrawing = function (signature) {
    if (_this.drawer != undefined) {
      _this.map.map.removeInteraction(_this.drawer);
    }
    _this.drawer = new ol.interaction.Draw({
      source: _this.source,
      type: signature.type
    });
    _this.drawer.once('drawend', function (event) {
      event.feature.set("sig", signature);
      if (event.feature.getGeometry().getType() === 'Polygon') {
        var point = new ol.geom.Point(event.feature.getGeometry().getFirstCoordinate());
        var coll = new ol.geom.GeometryCollection();
        coll.setGeometries([event.feature.getGeometry(), point]);
        event.feature.setGeometry(coll);
      }

      _this.map.map.removeInteraction(_this.drawer);
    });
    _this.map.map.addInteraction(_this.drawer);
  };

  this.addFeatures = function (features) {
    _this.source.addFeatures(features);
  };

  this.removeFeature = function (feature) {
    _this.source.removeFeature(feature);
    _this.select.getFeatures().clear();
  };


  this.geoJsonDownload = function (exportLink) {
    if ('download' in exportLink) {
      exportLink.href = _this.toDataUrl();
    } else {
      alert('Download not supported');
    }
  };

  this.clearSelection = function () {
    _this.select.getFeatures().clear();
  };

  this.startAutoSave = function () {
    var t = setTimeout(function () {
      document.getElementById('status').innerHTML = "auto save...";
      _this.save();
      setTimeout(function () {
        document.getElementById('status').innerHTML = "";
      }, 1000)
      _this.startAutoSave();
    }, 10000);

  };

}



