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

function DrawStyle() {
  var _this = this;

  var getDash = function (feature, resolution) {
    if (feature.get("sig").style === 'dash') {
      var value = _this.scaleFunction(resolution, 20);
      return [value, value];
    }
    else {
      return [0, 0];
    }
  }
  var defaultScaleFactor = 0.2;
  var textScaleFactor = 1.2
  this.filter = undefined;

  this.isFeatureFiltered = function(feature){
    return _this.filter!==undefined && _this.filter!==feature.get("sig").kat;
  };

  this.styleFunctionSelect = function (feature, resolution) {

    if (feature.get("sig") != undefined) {
      var isText = feature.get("sig").src === undefined;
      var scale = _this.scaleFunction(resolution, defaultScaleFactor);
      var style = !isText ? new ol.style.Style({
        stroke: new ol.style.Stroke({
          color: _this.colorFunction(feature.get("sig").kat, "highlight"),
          width: scale * 10,
          lineDash: getDash(feature, resolution)
        }),
        fill: new ol.style.Fill({
          color: _this.colorFunction(feature.get("sig").kat, "highlight", 0.3)
        }),
        image: new ol.style.Icon(({
          anchor: [0.5, 0.5],
          anchorXUnits: 'fraction',
          anchorYUnits: 'fraction',
          scale: scale,
          opacity: 1,
          rotation: feature.get("rotation") !== undefined ? feature.get("rotation") * Math.PI / 180 : 0,
          src: 'signaturen/' + feature.get("sig").src
        }))
      }) : new ol.style.Style({
        text: new ol.style.Text({
          text: feature.get("sig").text,
          font: "30px sans-serif",
          rotation: feature.get("rotation") !== undefined ? feature.get("rotation") * Math.PI / 180 : 0,
          scale: _this.scaleFunction(resolution, textScaleFactor),
          stroke: new ol.style.Stroke({
            color: '#FFFF66',
            width: 3
          }),
          fill: new ol.style.Fill({
            color: 'black'
          }),
        })});
      var style2 = new ol.style.Style({
        stroke: new ol.style.Stroke({
          color: [255, 255, 255, 0.7],
          width: scale * 20
        }),
        image: new ol.style.Circle({
          radius: scale * 210,
          fill: new ol.style.Fill({
            color: [255, 255, 255, 0.9]
          }),
          stroke: new ol.style.Stroke({
            color: _this.colorFunction(feature.get("sig").kat, "highlight", 0.9)
          })
        })
      });
      var style3 = new ol.style.Style({
        stroke: new ol.style.Stroke({
          color: _this.colorFunction(feature.get("sig").kat, "highlight"),
          width: scale * 30
        })
      });

      return isText ? style : [style3, style2, style];
    }
  };


  this.styleFunction = function (feature, resolution) {
    if(_this.isFeatureFiltered(feature)){
      return [];
    }
    if (feature.get("sig") != undefined) {
      var isText = feature.get("sig").src === undefined;

      var scale = _this.scaleFunction(resolution, defaultScaleFactor);
      var style =
       !isText ?
          new ol.style.Style({
            stroke: new ol.style.Stroke({
              color: _this.colorFunction(feature.get("sig").kat, "default"),
              width: scale * 20,
              lineDash: getDash(feature, resolution)
            }),
            fill: new ol.style.Fill({
              color: _this.colorFunction(feature.get("sig").kat, "default", 0.2)
            }),
            image: new ol.style.Icon(({
              anchor: [0.5, 0.5],
              anchorXUnits: 'fraction',
              anchorYUnits: 'fraction',
              scale: _this.scaleFunction(resolution, defaultScaleFactor),
              opacity: 1,
              rotation: feature.get("rotation") !== undefined ? feature.get("rotation") * Math.PI / 180 : 0,
              src: 'signaturen/' + feature.get("sig").src
            }))
          }) : new ol.style.Style({
          text: new ol.style.Text({
            text: feature.get("sig").text,
            font: "30px sans-serif",
            rotation: feature.get("rotation") !== undefined ? feature.get("rotation") * Math.PI / 180 : 0,
            scale: _this.scaleFunction(resolution, textScaleFactor),
            stroke: new ol.style.Stroke({
              color: '#FFFF66',
              width: 3
            }),
            fill: new ol.style.Fill({
              color: 'black'
            }),
          })
        });
      var style2 = new ol.style.Style({
        stroke: new ol.style.Stroke({
          color: [255, 255, 255, 0.5],
          width: scale * 40,
          lineDash: getDash(feature, resolution)
        }),
        image: new ol.style.Circle({
          radius: scale * 210,
          fill: new ol.style.Fill({
            color: [255, 255, 255, 0.6]
          })
        })
      });
      return isText ? style : [style2, style];
    }
  };

  this.styleFunctionModify = function (feature, resolution) {
    return new ol.style.Style({
      image: new ol.style.Circle({
        radius: 20 * 2,
        fill: new ol.style.Fill({
          color: [255, 0, 0, 1]
        }),
        stroke: new ol.style.Stroke({
          color: [255, 255, 255, 1],
          width: 20 / 2
        })
      }),
      zIndex: Infinity
    });
  };


  this.colorFunction = function (type, style, alpha) {
    var color = _this.colorMap[type][style];
    if (color != undefined) {
      return "rgba(" + color + ", " + (alpha != undefined ? alpha : "1") + ")";
    }
    else {
      return "blue";
    }
  }

  this.colorMap = ({
    "blue": {
      "default": "0, 0, 255",
      "highlight": "121, 153, 242"
    },
    "red": {
      "default": "255, 0, 0",
      "highlight": "255, 106, 106"
    },
    "other": {
      "default": "148, 139, 104",
      "highlight": "184, 172, 125"
    },
    "orange": {
      "default": "255, 145, 0",
      "highlight": "255, 204, 0"
    }
  });


  this.arrowStyleFunction = function (feature, resolution) {
    var geometry = feature.getGeometry();
    var scale = _this.scaleFunction(resolution);
    var styles = [
        new ol.style.Style({
          stroke: new ol.style.Stroke({
            color: _this.colorFunction(feature.get("sig").kat, "default"),
            width: scale * 10,
            lineDash: [0, 0]
          }),
          fill: new ol.style.Fill({
            color: _this.colorFunction(feature.get("sig").kat, "default", 0.2)
          }),
          image: new ol.style.Icon(({
            anchor: [0.5, 0.5],
            anchorXUnits: 'fraction',
            anchorYUnits: 'fraction',
            scale: _this.scaleFunction(resolution, 0.5),
            opacity: 1,
            src: 'signaturen/' + feature.get("sig").src
          }))
        })
      ]
      ;

    if (geometry.getType() === 'LineString') {
      geometry.forEachSegment(function (start, end) {
        var dx = end[0] - start[0];
        var dy = end[1] - start[1];
        var rotation = Math.atan2(dy, dx);
        // arrows
        styles.push(new ol.style.Style({
          geometry: new ol.geom.Point(end),
          image: new ol.style.Icon({
            src: 'img/arrow' + feature.get("sig").kat + '.png',
            scale: _this.scaleFunction(resolution, 2),
            anchor: [0.75, 0.5],
            rotateWithView: false,
            rotation: -rotation
          })
        }));
      });
    }


    return styles;
  };

}


DrawStyle.prototype.scaleFunction = function (resolution, scaleFactor) {
  return scaleFactor * Math.sqrt(0.5 * resolution) / resolution;
}
