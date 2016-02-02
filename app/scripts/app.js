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

var zivilschutz = angular.module('zivilschutz', ['ui.bootstrap']);

var orangeFilter = 'orange';
var redFilter = 'red';
var blueFilter = 'blue';


zivilschutz.factory('signatureService', function ($rootScope) {
  var signatureService = {};
  signatureService.currentSignature = undefined;
  signatureService.currentFeature = undefined;
  signatureService.notifySignatureSelection = function (sig) {
    signatureService.currentSignature = sig;
    $rootScope.$broadcast('signatureSelected');
  };
  signatureService.notifyFeatureSelection = function (feature) {
    signatureService.currentFeature = feature;
    $rootScope.$broadcast('featureSelected');
  };
  signatureService.deleteFeature = function (feature) {
    signatureService.currentFeature = feature;
    $rootScope.$broadcast('deleteFeature');
  };
  return signatureService;
});


zivilschutz.controller('SmartboardController', ['$scope', '$http', 'signatureService', '$rootScope', function ($scope, $http, signatureService, $rootScope) {
  //SB.wantsTouches = true;
  SB.initializeSMARTBoard();

  var green = "#009300";
  var red = "#ff0000";
  var blue = "#0000ff";
  var black = "#000000";

  var htmlColorToFilter = function (color) {
    switch (color) {
      case green:
        return orangeFilter;
      case red:
        return redFilter;
      case blue:
        return blueFilter;
      default:
        return undefined;
    }
  };

  // set up tool change event handler
  SB.onToolChange = function (evt) {
    if (evt.colorAsHTML !== undefined) {
      $rootScope.$broadcast('colorFilter', htmlColorToFilter(evt.colorAsHTML));
      $("#smartboardconnector").css("background", evt.colorAsHTML);
    }
  };
  SB.statusChanged = function (status) {
    $("#smartboardconnector").text(status);
  };
}]);


zivilschutz.controller('SignaturenController', ['$scope', '$http', 'signatureService', function ($scope, $http, signatureService) {

  window.loadSignaturen = function (data) {
    $scope.signaturen = data;
  };
  $http.jsonp('signaturen/signaturen.jsonp');
  $scope.selectItem = signatureService.notifySignatureSelection;
  $scope.$on('signatureSelected', function () {
    $scope.selectedSignature = signatureService.currentSignature;

  });

  $scope.$on('colorFilter', function (evt, args) {
    $scope.colorfilter = args;
    $scope.$apply();
  });


  $scope.$on('featureSelected', function () {
    $scope.selectedFeature = signatureService.currentFeature;
    $scope.selectedSignature = $scope.selectedFeature !== undefined ? $scope.selectedFeature.get('sig') : undefined;
    $scope.$apply();
    var slider = document.getElementById('slider');
    var sliderConfig = {
      min: 0,
      max: 360,
      step: 1,
      value: $scope.selectedFeature !== undefined ? $scope.selectedFeature.get("rotation") : 0,
      radius: 50,
      width: 5,
      startAngle: 90,
      endAngle: "+360",
      animation: true,
      showTooltip: false,
      editableTooltip: false,
      readOnly: false,
      disabled: false,
      keyboardAction: true,
      mouseScrollAction: false,
      sliderType: "min-range",
      circleShape: "full",
      handleSize: "+16",
      handleShape: "dot",

      // events
      beforeCreate: null,
      create: null,
      start: null,
      drag: function (x) {
        $scope.selectedFeature.set("rotation", x.value);
        $scope.selectedFeature.changed();
      },
      change: null,
      stop: null,
      tooltipFormat: null
    };
    $(slider).roundSlider(sliderConfig);
  });
  $scope.deleteFeature = function (feature) {
    $scope.selectedFeature = undefined;
    $scope.selectedSignature = undefined;
    signatureService.deleteFeature(feature);
  };
  $scope.endModification = function () {
    signatureService.notifyFeatureSelection(undefined);
  };
  $scope.addText = function () {
    $scope.selectedFeature = undefined;
    var sig = {
      "type": "Point",
      "text": $scope.text
    };
    $scope.selectItem(sig);
    $scope.text = undefined;
  }
}]);

zivilschutz.controller('MapController', ['$scope', '$http', 'signatureService', function ($scope, $http, signatureService) {
  var drawLayer = new DrawLayer(
    function (selectedElement) {
      signatureService.notifyFeatureSelection(selectedElement);
    }
  );
  var mainMap;

  $scope.toggleLayer = function (element) {
    for (var i = 0; i < element.layers.length; i++) {
      element.layers[i].setVisible(element.toggled);
    }
  };
  $scope.goto = function (provider) {
    window.location.hash = '#' + provider;
    window.location.reload();

  };

  $scope.removeAll = function () {
    if (window.confirm("Sind Sie sicher, dass Sie alle Elemente löschen möchten?")) {
      drawLayer.removeAll();
    }
  }

  $scope.$watch('symbolfilter', function (value) {
    drawLayer.filterFeatures(value);
  });

  $scope.$on('colorFilter', function (evt, args) {
    $scope.symbolfilter = args;
  });

  switchMapProvider(mapprovider, $http, function (zsMap) {
    mainMap = zsMap;
    drawLayer.initMap(zsMap);

    var clock = new Clock(document.getElementById('clock'));


    var exportLink = document.getElementById('export');
    exportLink.addEventListener('click', function () {
      drawLayer.geoJsonDownload(exportLink);
    });

    var exportJPGElement = document.getElementById('export-jpg');
    exportJPGElement.addEventListener('click', function (e) {
      zsMap.jpgDownload(exportJPGElement);
    }, false);

    $scope.providers = zsMap.providerList;
    $scope.selectedLayer = undefined;
    $scope.mylayers = zsMap.layers;
    drawLayer.load();
    drawLayer.startAutoSave();
    window.onbeforeunload = function (e) {
      drawLayer.save();
    };
    if ($scope.mylayers.length > 0) {
      for (var i = 0; i < $scope.mylayers.length; i++) {
        $scope.mylayers[i].toggled = i === 0;
        $scope.toggleLayer($scope.mylayers[i]);
      }
    }
  });


  $scope.$on('signatureSelected', function () {
    $scope.selectedSignature = signatureService.currentSignature;
    drawLayer.startDrawing(signatureService.currentSignature);
  });

  $scope.$on('featureSelected', function () {
    $scope.selectedFeature = signatureService.currentSignature;
  });

  $scope.$on('deleteFeature', function () {
    drawLayer.removeFeature(signatureService.currentFeature);
    $scope.selectedFeature = undefined;
  });

  var geocoder = 'http://nominatim.openstreetmap.org/search?format=json&q=';

  $scope.findPlace = function () {
    $http.get(geocoder + $scope.geocode).success(function (data, status) {
      if (data.length > 0) {
        var first = data[0];
        mainMap.gotoCoordinates(parseFloat(first.lon), parseFloat(first.lat));
      }
    })
  };

  $scope.readFromFile = function () {
    var file = document.getElementById("loadFromFile").files[0];
    if (file) {
      var reader = new FileReader();
      reader.readAsText(file, "UTF-8");
      reader.onload = function (evt) {
        drawLayer.loadFromString(evt.target.result);
      }
    }
  }
}]);


zivilschutz.controller('DrawController', ['$scope', '$http', 'signatureService', function ($scope, $http, signatureService) {
  $scope.$on('signatureSelected', function () {
    $scope.selectedSignature = signatureService.currentSignature;
    $scope.selectedFeature = undefined;
  });
}]);
