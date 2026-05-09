<?php
declare(strict_types=1);

require_once __DIR__ . '/../helpers.php';
cors();

if ($_SERVER['REQUEST_METHOD'] !== 'POST') error_out('Metodo no permitido', 405);

$payload = body();
$username = trim((string)($payload['username'] ?? ''));
$password = (string)($payload['password'] ?? '');

if (!$username || !$password) error_out('Usuario y contraseña requeridos');

$db = getDB();
$stmt = $db->prepare('SELECT * FROM users WHERE username = ? LIMIT 1');
$stmt->execute([$username]);
$user = $stmt->fetch();

if (!$user || !password_verify($password, $user['password_hash'])) {
    error_out('Usuario o contraseña incorrectos', 401);
}
if (!$user['enabled']) error_out('Cuenta deshabilitada', 403);

$token = bin2hex(random_bytes(32));
$db->prepare('INSERT INTO auth_tokens (user_id, token, expires_at) VALUES (?, ?, DATE_ADD(NOW(), INTERVAL ' . TOKEN_EXPIRY_DAYS . ' DAY))')
   ->execute([$user['id'], $token]);
$db->prepare('UPDATE users SET last_login = NOW() WHERE id = ?')->execute([$user['id']]);

json_out([
    'token' => $token,
    'user' => [
        'id' => (int)$user['id'],
        'username' => $user['username'],
        'display_name' => $user['display_name'] ?: $user['username'],
        'is_admin' => (bool)$user['is_admin'],
    ],
]);
