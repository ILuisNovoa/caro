<?php
declare(strict_types=1);

function configuration(): array
{
    static $configuration;
    if ($configuration !== null) return $configuration;
    $values = [];
    $file = dirname(__DIR__) . '/.env';
    if (is_file($file)) {
        foreach (file($file, FILE_IGNORE_NEW_LINES) as $line) {
            if (trim($line) === '' || str_starts_with(ltrim($line), '#') || !str_contains($line, '=')) continue;
            [$key, $value] = explode('=', $line, 2);
            $values[trim($key)] = trim($value);
        }
    }
    foreach (['DB_HOST', 'DB_PORT', 'DB_NAME', 'DB_USER', 'DB_PASSWORD', 'APP_SETUP_KEY', 'APP_URL'] as $key) {
        $environment = getenv($key);
        if ($environment !== false) $values[$key] = $environment;
    }
    $configuration = $values + ['DB_HOST' => '127.0.0.1', 'DB_PORT' => '3306', 'DB_NAME' => 'nuestra_historia',
        'DB_USER' => 'root', 'DB_PASSWORD' => '', 'APP_SETUP_KEY' => '', 'APP_URL' => 'http://localhost:8080'];
    return $configuration;
}

function database(bool $selectDatabase = true): PDO
{
    $config = configuration();
    $dsn = "mysql:host={$config['DB_HOST']};port={$config['DB_PORT']};charset=utf8mb4";
    if ($selectDatabase) $dsn .= ";dbname={$config['DB_NAME']}";
    return new PDO($dsn, $config['DB_USER'], $config['DB_PASSWORD'], [
        PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
        PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
        PDO::ATTR_EMULATE_PREPARES => false,
    ]);
}

function query(PDO $db, string $sql, array $parameters = []): PDOStatement
{
    $statement = $db->prepare($sql);
    $statement->execute($parameters);
    return $statement;
}

function storageDirectory(string $folder): string
{
    $directory = dirname(__DIR__) . '/storage/' . $folder;
    if (!is_dir($directory) && !mkdir($directory, 0700, true) && !is_dir($directory)) {
        throw new RuntimeException('No se pudo preparar el almacenamiento.');
    }
    return $directory;
}
