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

function OfflineMap(coordinates, imageSize, url, minRes, maxRes) {
    this.imgProjection = new ol.proj.Projection({
        code: 'pixel',
        extent: coordinates
    });

    this.layer = new ol.layer.Image({
        source: new ol.source.ImageStatic({
            url: url,
            imageSize: imageSize,
            imageExtent:this.imgProjection.getExtent(),
            extent: getMercatorProjection().getExtent()
        }),
        maxResolution: maxRes,
        minResolution: minRes
    });
}