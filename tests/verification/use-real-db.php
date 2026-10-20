#!/usr/bin/env php
<?php
/**
 * Switch the .env back to the real database (bus_tracking).
 * Usage: php tests/verification/use-real-db.php
 */
$envFile = __DIR__ . '/../../.env';
if (!file_exists($envFile)) {
    fwrite(STDERR, "Error: .env not found at {$envFile}\n");
    exit(1);
}

$lines = file($envFile, FILE_IGNORE_NEW_LINES | FILE_SKIP_EMPTY_LINES);
$newLines = [];
$found = false;
foreach ($lines as $line) {
    if (str_starts_with(trim($line), 'DB_DATABASE=')) {
        $newLines[] = 'DB_DATABASE=bus_tracking';
        $found = true;
    } else {
        $newLines[] = $line;
    }
}
if (!$found) {
    fwrite(STDERR, "Error: DB_DATABASE= not found in .env\n");
    exit(1);
}
file_put_contents($envFile, implode("\n", $newLines) . "\n");
echo "Switched DB_DATABASE back to bus_tracking\n";
