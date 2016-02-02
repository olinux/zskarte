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

function Clock(clockElement) {
    var update = function () {
        var now = new Date();
        var h = normalize(now.getHours());
        var m = normalize(now.getMinutes());
        var s = normalize(now.getSeconds());
        var day = normalize(now.getDate());
        var month = normalize(now.getMonth()+1);
        var year = now.getFullYear();
        clockElement.innerHTML = h + ":" + m + ":" + s+"<br/>"+day+"."+month+"."+year;
        var t = setTimeout(function () {
            update()
        }, 1000);
    };

    function normalize(i) {
        if (i < 10) {
            i = "0" + i
        }
        return i;
    }
    update();


}
