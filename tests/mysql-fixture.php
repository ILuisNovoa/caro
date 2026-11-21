<?php
declare(strict_types=1);
require dirname(__DIR__) . '/backend/bootstrap.php';
$config = configuration();
if (!preg_match('/^book_test_[a-f0-9_]+$/D', $config['DB_NAME'])) throw new RuntimeException('Unexpected test database');
$db = database(false);
if (($argv[1] ?? '') === 'drop') {
    $db->exec('DROP DATABASE `' . $config['DB_NAME'] . '`');
} else {
    $sql = str_replace('`nuestra_historia`', '`' . $config['DB_NAME'] . '`', file_get_contents(dirname(__DIR__) . '/database/schema.sql'));
    $db->exec($sql);
}
