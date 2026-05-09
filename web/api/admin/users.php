<?php
declare(strict_types=1);

require_once __DIR__ . '/../helpers.php';
cors();

$admin = requireAdmin();
$db = getDB();

function user_row(array $row): array {
    return [
        'id' => (int)$row['id'],
        'username' => $row['username'],
        'display_name' => $row['display_name'] ?: $row['username'],
        'is_admin' => (bool)$row['is_admin'],
        'enabled' => (bool)$row['enabled'],
        'created_at' => $row['created_at'] ?? null,
        'last_login' => $row['last_login'] ?? null,
    ];
}

if ($_SERVER['REQUEST_METHOD'] === 'GET') {
    $stmt = $db->query('SELECT id, username, display_name, is_admin, enabled, created_at, last_login FROM users ORDER BY username ASC');
    json_out(['users' => array_map('user_row', $stmt->fetchAll())]);
}

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    error_out('Metodo no permitido', 405);
}

$payload = body();
$action = (string)($payload['action'] ?? 'create');

if ($action === 'create') {
    $username = trim((string)($payload['username'] ?? ''));
    $password = (string)($payload['password'] ?? '');
    $displayName = trim((string)($payload['display_name'] ?? ''));
    $isAdmin = !empty($payload['is_admin']) ? 1 : 0;

    if (!preg_match('/^[a-zA-Z0-9._-]{3,50}$/', $username)) {
        error_out('Usuario invalido. Usa 3 a 50 caracteres: letras, numeros, punto, guion o guion bajo.');
    }
    if (strlen($password) < 6) {
        error_out('La contraseña debe tener al menos 6 caracteres.');
    }

    try {
        $db->prepare('INSERT INTO users (username, password_hash, display_name, is_admin, enabled) VALUES (?, ?, ?, ?, 1)')
            ->execute([$username, password_hash($password, PASSWORD_DEFAULT), $displayName, $isAdmin]);
    } catch (Throwable $error) {
        error_out('Ese usuario ya existe.', 409);
    }
    json_out(['ok' => true]);
}

if ($action === 'toggle') {
    $id = (int)($payload['id'] ?? 0);
    $enabled = !empty($payload['enabled']) ? 1 : 0;
    if ($id <= 0) error_out('Usuario invalido');
    if ($id === (int)$admin['id'] && !$enabled) error_out('No podes deshabilitar tu propio usuario admin');

    $db->prepare('UPDATE users SET enabled = ? WHERE id = ?')->execute([$enabled, $id]);
    if (!$enabled) $db->prepare('DELETE FROM auth_tokens WHERE user_id = ?')->execute([$id]);
    json_out(['ok' => true]);
}

if ($action === 'password') {
    $id = (int)($payload['id'] ?? 0);
    $password = (string)($payload['password'] ?? '');
    if ($id <= 0) error_out('Usuario invalido');
    if (strlen($password) < 6) error_out('La contraseña debe tener al menos 6 caracteres.');

    $db->prepare('UPDATE users SET password_hash = ? WHERE id = ?')
        ->execute([password_hash($password, PASSWORD_DEFAULT), $id]);
    $db->prepare('DELETE FROM auth_tokens WHERE user_id = ?')->execute([$id]);
    json_out(['ok' => true]);
}

error_out('Accion no soportada');
