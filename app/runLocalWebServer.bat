cd %~dp0
powershell -Command "(New-Object Net.WebClient).DownloadFile('http://www.jibble.org/files/WebServerLite.jar', 'WebServerLite.jar')"
java -jar WebServerLite.jar . 8888
