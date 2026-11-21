<?php
declare(strict_types=1);
if (PHP_SAPI !== 'cli') { http_response_code(404); exit; }
require dirname(__DIR__) . '/backend/bootstrap.php';

$envPath = dirname(__DIR__) . '/.env';
if (!is_file($envPath)) {
    $template = file_get_contents(dirname(__DIR__) . '/.env.example');
    $template = str_replace('APP_SETUP_KEY=', 'APP_SETUP_KEY=' . bin2hex(random_bytes(32)), $template);
    file_put_contents($envPath, $template, LOCK_EX);
    @chmod($envPath, 0600);
}

try {
    $config = configuration();
    if (!preg_match('/^[a-zA-Z0-9_]+$/', $config['DB_NAME'])) throw new RuntimeException('El nombre de la base de datos no es válido.');
    $db = database(false);
    $sql = str_replace('`nuestra_historia`', '`' . $config['DB_NAME'] . '`', file_get_contents(dirname(__DIR__) . '/database/schema.sql'));
    $db->exec($sql);
    storageDirectory('uploads');
    storageDirectory('sessions');
    echo "MySQL preparado. Base de datos: {$config['DB_NAME']}\n";
    echo "Abre el enlace de configuración en el navegador:\n";
    echo rtrim($config['APP_URL'], '/') . '/?setup=' . rawurlencode($config['APP_SETUP_KEY']) . "\n";
} catch (Throwable $error) {
    fwrite(STDERR, "No se pudo conectar o crear la base de datos. Revisa DB_HOST, DB_PORT, DB_USER y DB_PASSWORD en .env.\n");
    exit(1);
}
