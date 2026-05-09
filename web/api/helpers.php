<?php
declare(strict_types=1);

ob_start();
error_reporting(0);
ini_set('display_errors', '0');

require_once __DIR__ . '/config.php';

function getDB(): PDO {
    static $pdo;
    if (!$pdo) {
        $pdo = new PDO(
            'mysql:host=' . DB_HOST . ';dbname=' . DB_NAME . ';charset=utf8mb4',
            DB_USER,
            DB_PASS,
            [
                PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
                PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
            ]
        );
    }
    return $pdo;
}

function cors(): void {
    header('Access-Control-Allow-Methods: GET, POST, OPTIONS');
    header('Access-Control-Allow-Headers: Content-Type, Authorization');
    header('Content-Type: application/json; charset=utf-8');
    if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
        http_response_code(200);
        exit;
    }
}

function json_out(array $data, int $code = 200): void {
    ob_end_clean();
    http_response_code($code);
    echo json_encode($data, JSON_UNESCAPED_UNICODE);
    exit;
}

function error_out(string $message, int $code = 400): void {
    json_out(['error' => $message], $code);
}

function body(): array {
    $data = json_decode(file_get_contents('php://input') ?: '', true);
    return is_array($data) ? $data : [];
}

function bearerToken(): string {
    $headers = function_exists('getallheaders') ? getallheaders() : [];
    $auth = $headers['Authorization'] ?? $headers['authorization'] ?? '';
    if (!$auth && !empty($_SERVER['HTTP_AUTHORIZATION'])) $auth = $_SERVER['HTTP_AUTHORIZATION'];
    if (!$auth && !empty($_SERVER['REDIRECT_HTTP_AUTHORIZATION'])) $auth = $_SERVER['REDIRECT_HTTP_AUTHORIZATION'];
    return trim(str_replace('Bearer ', '', $auth));
}

function getAuthUser(): ?array {
    $token = bearerToken();
    if (!$token) return null;

    $db = getDB();
    $stmt = $db->prepare("
        SELECT u.* FROM users u
        JOIN auth_tokens t ON t.user_id = u.id
        WHERE t.token = ? AND t.expires_at > NOW() AND u.enabled = 1
        LIMIT 1
    ");
    $stmt->execute([$token]);
    $user = $stmt->fetch();
    if (!$user) return null;

    $db->prepare("UPDATE auth_tokens SET last_used = NOW(), expires_at = DATE_ADD(NOW(), INTERVAL " . TOKEN_EXPIRY_DAYS . " DAY) WHERE token = ?")
       ->execute([$token]);
    return $user;
}

function requireAuth(): array {
    $user = getAuthUser();
    if (!$user) error_out('No autorizado', 401);
    return $user;
}

function requireAdmin(): array {
    $user = requireAuth();
    if (empty($user['is_admin'])) error_out('Acceso denegado', 403);
    return $user;
}
