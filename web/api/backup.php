<?php
declare(strict_types=1);

require_once __DIR__ . '/helpers.php';
cors();

$user = requireAuth();
$db = getDB();

if ($_SERVER['REQUEST_METHOD'] === 'GET') {
    $stmt = $db->prepare("SELECT data FROM user_data WHERE user_id = ? AND data_type = 'hogar_state' AND local_id = 'main'");
    $stmt->execute([$user['id']]);
    $row = $stmt->fetch();
    $state = $row ? json_decode((string)$row['data'], true) : null;
    if (!is_array($state)) $state = [];

    ob_end_clean();
    header('Content-Type: application/json; charset=utf-8');
    header('Content-Disposition: attachment; filename="pretium-hogar-backup-' . date('Y-m-d') . '.json"');
    echo json_encode($state, JSON_UNESCAPED_UNICODE | JSON_PRETTY_PRINT);
    exit;
}

if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    $payload = body();
    if (!isset($payload['state']) || !is_array($payload['state'])) {
        error_out('Backup invalido');
    }

    $db->prepare(
        "INSERT INTO user_data (user_id, data_type, local_id, data, updated_at, deleted)
         VALUES (?, 'hogar_state', 'main', ?, NOW(), 0)
         ON DUPLICATE KEY UPDATE data = VALUES(data), updated_at = NOW(), deleted = 0"
    )->execute([$user['id'], json_encode($payload['state'], JSON_UNESCAPED_UNICODE)]);

    json_out(['ok' => true, 'updated_at' => date('Y-m-d H:i:s')]);
}

error_out('Metodo no permitido', 405);
