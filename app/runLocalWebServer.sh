#!/bin/bash
BASEDIR=$(dirname $0)
cd $BASEDIR
if [ ! -f $BASEDIR/WebServerLite.jar ]
then
   echo "Downloading Jibble Web Server"
   wget http://www.jibble.org/files/WebServerLite.jar	
fi
java -jar WebServerLite.jar . 8888 &



