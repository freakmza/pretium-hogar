<?php
declare(strict_types=1);

require_once __DIR__ . '/../api/config.php';

try {
    $pdo = new PDO(
        'mysql:host=' . DB_HOST . ';dbname=' . DB_NAME . ';charset=utf8mb4',
        DB_USER,
        DB_PASS,
        [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION]
    );
} catch (Throwable $error) {
    die('Error de conexion: ' . htmlspecialchars($error->getMessage(), ENT_QUOTES, 'UTF-8'));
}

$steps = [];

$pdo->exec("
    CREATE TABLE IF NOT EXISTS users (
        id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
        username VARCHAR(50) NOT NULL UNIQUE,
        password_hash VARCHAR(255) NOT NULL,
        display_name VARCHAR(100) NOT NULL DEFAULT '',
        is_admin TINYINT(1) NOT NULL DEFAULT 0,
        enabled TINYINT(1) NOT NULL DEFAULT 1,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        last_login DATETIME NULL
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
");
$steps[] = 'Tabla users lista';

$pdo->exec("
    CREATE TABLE IF NOT EXISTS auth_tokens (
        id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
        user_id INT UNSIGNED NOT NULL,
        token CHAR(64) NOT NULL UNIQUE,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        expires_at DATETIME NOT NULL,
        last_used DATETIME NULL,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
");
$steps[] = 'Tabla auth_tokens lista';

$pdo->exec("
    CREATE TABLE IF NOT EXISTS user_data (
        id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
        user_id INT UNSIGNED NOT NULL,
        data_type ENUM('hogar_state') NOT NULL,
        local_id VARCHAR(100) NOT NULL,
        data LONGTEXT NOT NULL,
        updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        deleted TINYINT(1) NOT NULL DEFAULT 0,
        UNIQUE KEY uq_user_type_local (user_id, data_type, local_id),
        INDEX idx_user_data_updated (user_id, updated_at),
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
");
$steps[] = 'Tabla user_data lista';

$adminUser = 'admin';
$adminPass = 'Cambiar1234';
$stmt = $pdo->prepare('SELECT id FROM users WHERE username = ?');
$stmt->execute([$adminUser]);
if (!$stmt->fetch()) {
    $pdo->prepare('INSERT INTO users (username, password_hash, display_name, is_admin) VALUES (?, ?, ?, 1)')
        ->execute([$adminUser, password_hash($adminPass, PASSWORD_DEFAULT), 'Administrador']);
    $steps[] = 'Usuario admin creado';
} else {
    $steps[] = 'Usuario admin ya existia';
}
?>
<!doctype html>
<html lang="es">
<head>
  <meta charset="utf-8">
  <title>PRETIUM HOGAR - Instalacion</title>
  <style>body{font-family:system-ui,sans-serif;max-width:560px;margin:56px auto;padding:0 18px;line-height:1.45}</style>
</head>
<body>
  <h1>PRETIUM HOGAR - Instalacion</h1>
  <ul>
    <?php foreach ($steps as $step): ?><li><?= htmlspecialchars($step, ENT_QUOTES, 'UTF-8') ?></li><?php endforeach; ?>
  </ul>
  <p>Usuario inicial: <strong>admin</strong></p>
  <p>Contraseña inicial: <strong>Cambiar1234</strong></p>
  <p>Despues de entrar, cambia esta contraseña desde la base de datos o crea el usuario definitivo y elimina este archivo.</p>
</body>
</html>
