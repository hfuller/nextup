<?php
$config = json_decode(file_get_contents("config.json"));
readfile($config->calendarUrl);

