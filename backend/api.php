<?php
declare(strict_types=1);
require __DIR__ . '/bootstrap.php';

function respond(array $data, int $status = 200): never
{
    http_response_code($status);
    header('Content-Type: application/json; charset=utf-8');
    header('Cache-Control: private, no-store');
    header('X-Content-Type-Options: nosniff');
    echo json_encode($data, JSON_UNESCAPED_UNICODE | JSON_THROW_ON_ERROR);
    exit;
}

function fail(string $message, int $status = 400): never
{
    respond(['error' => $message], $status);
}

function jsonInput(): array
{
    $raw = file_get_contents('php://input', false, null, 0, 16385);
    if (strlen($raw) > 16384) fail('El texto es demasiado grande.', 413);
    $data = json_decode($raw, true);
    if (!is_array($data)) fail('No pudimos leer los datos. Vuelve a intentarlo.');
    return $data;
}

function validPassword(mixed $password): string
{
    if (!is_string($password) || strlen($password) < 10 || strlen($password) > 72) {
        fail('Usa una contraseña de entre 10 y 72 caracteres.');
    }
    return $password;
}

function accountInput(array $data): array
{
    $username = strtolower(trim((string) ($data['username'] ?? '')));
    $name = trim((string) ($data['name'] ?? ''));
    if (!preg_match('/^[a-z0-9_.-]{3,40}$/', $username)) fail('Elige un usuario de 3 a 40 letras sin tildes, números, puntos o guiones.');
    if ($name === '' || mb_strlen($name) > 60) fail('Escribe un nombre de hasta 60 caracteres.');
    return [$username, $name, password_hash(validPassword($data['password'] ?? null), PASSWORD_DEFAULT)];
}

function currentUser(PDO $db): ?array
{
    if (!isset($_SESSION['role'], $_SESSION['version'])) return null;
    $profile = query($db, 'SELECT role,username,display_name AS name,session_version FROM profiles WHERE role=?', [$_SESSION['role']])->fetch();
    if (!$profile || (int) $profile['session_version'] !== (int) $_SESSION['version']) return null;
    unset($profile['session_version']);
    return $profile;
}

function signIn(PDO $db, string $role): void
{
    session_regenerate_id(true);
    $version = query($db, 'SELECT session_version FROM profiles WHERE role=?', [$role])->fetchColumn();
    $_SESSION = ['role' => $role, 'version' => (int) $version];
}

function streamFile(string $file, string $type): never
{
    if (!is_file($file)) fail('No encontramos este archivo.', 404);
    $size = filesize($file);
    $start = 0;
    $end = $size - 1;
    if (!empty($_SERVER['HTTP_RANGE'])) {
        if (!preg_match('/^bytes=(\d+)-(\d*)$/D', $_SERVER['HTTP_RANGE'], $range)) {
            header("Content-Range: bytes */$size");
            http_response_code(416);
            exit;
        }
        $start = (int) $range[1];
        $end = $range[2] === '' ? $end : min($end, (int) $range[2]);
        if ($start > $end || $start >= $size) {
            header("Content-Range: bytes */$size");
            http_response_code(416);
            exit;
        }
        http_response_code(206);
        header("Content-Range: bytes $start-$end/$size");
    }
    header('Content-Type: ' . $type);
    header('Cache-Control: private, no-store');
    header('X-Content-Type-Options: nosniff');
    header('Accept-Ranges: bytes');
    header('Content-Length: ' . ($end - $start + 1));
    session_write_close();
    if ($_SERVER['REQUEST_METHOD'] === 'HEAD') exit;
    $handle = fopen($file, 'rb');
    fseek($handle, $start);
    $remaining = $end - $start + 1;
    while ($remaining > 0 && !feof($handle)) {
        $chunk = fread($handle, min(65536, $remaining));
        if ($chunk === false || $chunk === '') break;
        echo $chunk;
        $remaining -= strlen($chunk);
    }
    fclose($handle);
    exit;
}

try {
    $method = $_SERVER['REQUEST_METHOD'];
    $route = '/' . trim((string) ($_GET['route'] ?? ''), '/');
    $secure = !empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off';
    if (!in_array($method, ['GET', 'HEAD'], true)) {
        $origin = $_SERVER['HTTP_ORIGIN'] ?? '';
        $expected = ($secure ? 'https' : 'http') . '://' . ($_SERVER['HTTP_HOST'] ?? '');
        if ($origin !== $expected) fail('Vuelve a abrir el libro para guardar los cambios.', 403);
    }
    session_name('book_session');
    session_save_path(storageDirectory('sessions'));
    ini_set('session.use_strict_mode', '1');
    ini_set('session.gc_maxlifetime', '2592000');
    session_set_cookie_params(['lifetime' => 2592000, 'path' => '/', 'secure' => $secure,
        'httponly' => true, 'samesite' => 'Lax']);
    session_start();
    $db = database();
    $config = configuration();
    $count = (int) query($db, 'SELECT COUNT(*) FROM profiles')->fetchColumn();
    $setupKey = $_SERVER['HTTP_X_SETUP_KEY'] ?? '';
    $setupAllowed = $config['APP_SETUP_KEY'] !== '' && hash_equals($config['APP_SETUP_KEY'], $setupKey);

    if ($route === '/session' && $method === 'GET') {
        respond(['user' => currentUser($db), 'initialized' => $count === 2, 'setupAvailable' => $count === 0 && $setupAllowed]);
    }
    if ($route === '/setup' && $method === 'POST') {
        if (!$setupAllowed) fail('Abre el enlace privado de configuración generado por la instalación.', 403);
        if ($count !== 0) fail('Las dos cuentas ya están creadas.', 409);
        $input = jsonInput();
        $blue = accountInput($input['blue'] ?? []);
        $pink = accountInput($input['pink'] ?? []);
        if ($blue[0] === $pink[0]) fail('Elige un usuario diferente para cada uno.');
        $db->beginTransaction();
        query($db, 'INSERT INTO profiles(role,username,display_name,password_hash) VALUES (?,?,?,?)', array_merge(['blue'], $blue));
        query($db, 'INSERT INTO profiles(role,username,display_name,password_hash) VALUES (?,?,?,?)', array_merge(['pink'], $pink));
        $db->commit();
        signIn($db, 'blue');
        respond(['saved' => true], 201);
    }
    if ($route === '/login' && $method === 'POST') {
        $input = jsonInput();
        $username = substr(strtolower(trim((string) ($input['username'] ?? ''))), 0, 40);
        $password = substr((string) ($input['password'] ?? ''), 0, 73);
        $window = (int) floor(time() / 900);
        $key = hash('sha256', ($_SERVER['REMOTE_ADDR'] ?? '') . ':' . $window);
        query($db, 'DELETE FROM login_limits WHERE expires_at < ?', [time()]);
        query($db, 'INSERT INTO login_limits(rate_key,attempts,expires_at) VALUES (?,1,?) ON DUPLICATE KEY UPDATE attempts=attempts+1', [$key, ($window + 1) * 900]);
        if ((int) query($db, 'SELECT attempts FROM login_limits WHERE rate_key=?', [$key])->fetchColumn() > 30) {
            fail('Demasiados intentos. Espera 15 minutos y vuelve a intentar.', 429);
        }
        $profile = query($db, 'SELECT role,password_hash FROM profiles WHERE username=?', [$username])->fetch();
        if (!$profile || strlen($password) > 72 || !password_verify($password, $profile['password_hash'])) fail('Revisa tu usuario y contraseña.', 401);
        signIn($db, $profile['role']);
        respond(['signedIn' => true]);
    }

    $user = currentUser($db);
    if (!$user) fail('Inicia sesión para ver nuestros recuerdos.', 401);
    if ($route === '/logout' && $method === 'POST') {
        $_SESSION = [];
        session_destroy();
        setcookie(session_name(), '', ['expires' => time() - 3600, 'path' => '/', 'secure' => $secure, 'httponly' => true, 'samesite' => 'Lax']);
        respond(['signedOut' => true]);
    }
    if ($route === '/profile' && $method === 'PATCH') {
        $input = jsonInput();
        $name = trim((string) ($input['name'] ?? ''));
        if ($name === '' || mb_strlen($name) > 60) fail('Escribe un nombre de hasta 60 caracteres.');
        query($db, 'UPDATE profiles SET display_name=? WHERE role=?', [$name, $user['role']]);
        respond(['saved' => true]);
    }
    if ($route === '/password' && $method === 'POST') {
        $input = jsonInput();
        $hash = query($db, 'SELECT password_hash FROM profiles WHERE role=?', [$user['role']])->fetchColumn();
        if (!password_verify((string) ($input['currentPassword'] ?? ''), $hash)) fail('La contraseña actual no coincide.', 401);
        $newHash = password_hash(validPassword($input['password'] ?? null), PASSWORD_DEFAULT);
        query($db, 'UPDATE profiles SET password_hash=?,session_version=session_version+1 WHERE role=?', [$newHash, $user['role']]);
        signIn($db, $user['role']);
        respond(['saved' => true]);
    }
    if (str_starts_with($route, '/legacy/') && in_array($method, ['GET', 'HEAD'], true)) {
        $relative = substr($route, strlen('/legacy/'));
        $root = realpath(dirname(__DIR__) . '/media');
        $file = realpath($root . '/' . $relative);
        if (!$root || !$file || !str_starts_with($file, $root . DIRECTORY_SEPARATOR) || !is_file($file)) fail('Archivo no disponible.', 404);
        $types = ['mp3' => 'audio/mpeg', 'm4a' => 'audio/mp4', 'ogg' => 'audio/ogg', 'wav' => 'audio/wav', 'aac' => 'audio/aac',
            'jpg' => 'image/jpeg', 'jpeg' => 'image/jpeg', 'png' => 'image/png', 'webp' => 'image/webp'];
        $type = $types[strtolower(pathinfo($file, PATHINFO_EXTENSION))] ?? null;
        if (!$type) fail('Archivo no disponible.', 404);
        streamFile($file, $type);
    }
    if ($route === '/memories' && $method === 'GET') {
        $memories = query($db, 'SELECT m.id,m.author_role AS color,m.title,m.body,m.created_at,p.display_name AS author,(m.photo_key IS NOT NULL) AS has_photo FROM memories m JOIN profiles p ON p.role=m.author_role ORDER BY m.created_at,m.id')->fetchAll();
        respond(['memories' => $memories]);
    }
    if ($route === '/memories' && $method === 'POST') {
        if ((int) ($_SERVER['CONTENT_LENGTH'] ?? 0) > 12 * 1024 * 1024) fail('La foto supera los 10 MB.', 413);
        $title = trim((string) ($_POST['title'] ?? ''));
        $body = trim((string) ($_POST['body'] ?? ''));
        $photo = $_FILES['photo'] ?? null;
        $hasPhoto = $photo && $photo['error'] !== UPLOAD_ERR_NO_FILE;
        if ($title === '' || mb_strlen($title) > 120) fail('Escribe un título de hasta 120 caracteres.');
        if (mb_strlen($body) > 8000) fail('El texto puede tener hasta 8000 caracteres.');
        if ($body === '' && !$hasPhoto) fail('Añade una foto o escribe el recuerdo.');
        $id = (string) ($_POST['requestId'] ?? '');
        if (!preg_match('/^[a-f0-9-]{36}$/D', $id)) {
            $random = bin2hex(random_bytes(16));
            $id = substr($random, 0, 8) . '-' . substr($random, 8, 4) . '-' . substr($random, 12, 4) . '-' . substr($random, 16, 4) . '-' . substr($random, 20);
        }
        $existing = query($db, 'SELECT author_role,title,body FROM memories WHERE id=?', [$id])->fetch();
        if ($existing) {
            if ($existing['author_role'] !== $user['role'] || $existing['title'] !== $title || $existing['body'] !== $body) fail('Vuelve a abrir el formulario para crear otro recuerdo.', 409);
            respond(['id' => $id], 201);
        }
        $photoKey = null;
        $type = null;
        if ($hasPhoto) {
            if ($photo['error'] !== UPLOAD_ERR_OK || $photo['size'] > 10 * 1024 * 1024) fail('No se pudo subir la foto. Usa una de hasta 10 MB.', 413);
            $type = (new finfo(FILEINFO_MIME_TYPE))->file($photo['tmp_name']);
            if (!in_array($type, ['image/jpeg', 'image/png', 'image/webp'], true) || !getimagesize($photo['tmp_name'])) fail('Elige una foto JPG, PNG o WEBP válida.');
            $photoKey = bin2hex(random_bytes(24));
            if (!move_uploaded_file($photo['tmp_name'], storageDirectory('uploads') . '/' . $photoKey)) fail('No pudimos guardar la foto. Inténtalo de nuevo.', 500);
        }
        try {
            query($db, 'INSERT INTO memories(id,author_role,title,body,photo_key,photo_type) VALUES (?,?,?,?,?,?)', [$id, $user['role'], $title, $body, $photoKey, $type]);
        } catch (Throwable $error) {
            if ($photoKey) @unlink(storageDirectory('uploads') . '/' . $photoKey);
            throw $error;
        }
        respond(['id' => $id], 201);
    }
    if (preg_match('#^/memories/([a-f0-9-]{36})(/photo)?$#D', $route, $match)) {
        $memory = query($db, 'SELECT * FROM memories WHERE id=?', [$match[1]])->fetch();
        if (!$memory) fail('Este recuerdo ya no está disponible.', 404);
        if (!empty($match[2]) && in_array($method, ['GET', 'HEAD'], true)) {
            if (!$memory['photo_key']) fail('Este recuerdo no tiene foto.', 404);
            streamFile(storageDirectory('uploads') . '/' . $memory['photo_key'], $memory['photo_type']);
        }
        if (empty($match[2]) && $method === 'DELETE') {
            if ($memory['author_role'] !== $user['role']) fail('Puedes eliminar tus propios recuerdos.', 403);
            query($db, 'DELETE FROM memories WHERE id=? AND author_role=?', [$memory['id'], $user['role']]);
            if ($memory['photo_key']) @unlink(storageDirectory('uploads') . '/' . $memory['photo_key']);
            respond(['deleted' => true]);
        }
    }
    fail('No encontramos esta página.', 404);
} catch (Throwable $error) {
    if (isset($db) && $db->inTransaction()) $db->rollBack();
    error_log('book_api_failed: ' . $error->getMessage());
    respond(['error' => 'No pudimos guardar o cargar los recuerdos. Revisa la conexión con MySQL e inténtalo de nuevo.'], 500);
}
