<?php
declare(strict_types=1);

require_once __DIR__ . '/helpers.php';
cors();

$user = requireAuth();
$pdo = getDB();

if ($_SERVER['REQUEST_METHOD'] === 'GET') {
    $stmt = $pdo->prepare("SELECT data, updated_at FROM user_data WHERE user_id = ? AND data_type = 'hogar_state' AND local_id = 'main'");
    $stmt->execute([$user['id']]);
    $row = $stmt->fetch();
    echo json_encode([
        'state' => $row ? json_decode((string) $row['data'], true) : null,
        'updated_at' => $row['updated_at'] ?? null,
    ]);
    exit;
}

if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    $payload = json_decode(file_get_contents('php://input') ?: '', true);
    if (!is_array($payload) || !isset($payload['state']) || !is_array($payload['state'])) {
        http_response_code(400);
        echo json_encode(['error' => 'Datos invalidos']);
        exit;
    }

    $stateJson = json_encode($payload['state'], JSON_UNESCAPED_UNICODE);
    $stmt = $pdo->prepare(
        "INSERT INTO user_data (user_id, data_type, local_id, data, updated_at, deleted)
         VALUES (?, 'hogar_state', 'main', ?, NOW(), 0)
         ON DUPLICATE KEY UPDATE data = VALUES(data), updated_at = NOW(), deleted = 0"
    );
    $stmt->execute([$user['id'], $stateJson]);

    $stmt = $pdo->prepare("SELECT updated_at FROM user_data WHERE user_id = ? AND data_type = 'hogar_state' AND local_id = 'main'");
    $stmt->execute([$user['id']]);
    $row = $stmt->fetch();

    echo json_encode(['ok' => true, 'updated_at' => $row['updated_at'] ?? null]);
    exit;
}

http_response_code(405);
echo json_encode(['error' => 'Metodo no permitido']);
