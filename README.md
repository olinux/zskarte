# Zivilschutzkarte
Zivilschutz-Karte is a javascript application (based on AngularJS) which allows to draw situation maps for disaster management. It has been developed for the Swiss civil defense organisation "Zivilschutzorganisation Bern Plus". The drawing application can be used either with standard computers or with interactive whiteboards and is ready to be executed - e.g. in case of interrupted connections - in offline mode (with prepared offline maps and a restricted set of functionalities) as well as in online mode with the full capacities of modern map features.

##Installation
Simply download the ZIP-file and open the "index.html" in a modern web browser (e.g. Google Chrome)

##Configuration
You can add offline maps to the folder "offlinemap" and register them in the file "offlinemap/offlinemap.jsonp". Please see the provided example. All you need for configuration is the coordinates of the upper left and lower right corner of your map defined in [Mercator projection](http://en.wikipedia.org/wiki/Mercator_projection) as well as the image size in pixels. You can also define for which zoom levels a specific image shall be used and therefore define different levels of detailedness according to the zoom.

##Terms of use
Please note, that this application integrates several different map provider services. Since the terms of use of the different services usually restrict the extent of use (limited quotas, restricted access to data layers), it's the liability of the user to make sure that the corresponding limitations and/or preconditions are fulfilled.