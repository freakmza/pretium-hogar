<?php
declare(strict_types=1);

require_once __DIR__ . '/../helpers.php';
cors();

$token = bearerToken();
if ($token) {
    getDB()->prepare('DELETE FROM auth_tokens WHERE token = ?')->execute([$token]);
}

json_out(['ok' => true]);
