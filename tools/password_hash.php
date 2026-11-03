<?php
/**
 * Erzeugt einen Passwort-Hash für `auth.password_hash` in config.php.
 *
 * Aufruf im Browser: https://deine-domain.ch/tools/password_hash.php
 * Das Skript speichert nichts; es rechnet nur den Hash aus. Trotzdem nach
 * dem Einrichten löschen.
 *
 * Alternativ per SSH: php tools/password_hash.php "MeinPasswort"
 */

declare(strict_types=1);

if (PHP_SAPI === 'cli') {
    $password = $argv[1] ?? '';
    if ($password === '') {
        fwrite(STDERR, "Aufruf: php tools/password_hash.php \"MeinPasswort\"\n");
        exit(1);
    }
    echo password_hash($password, PASSWORD_DEFAULT), PHP_EOL;
    exit(0);
}

header('Content-Type: text/html; charset=utf-8');
header('Cache-Control: no-store');
header('X-Robots-Tag: noindex');

$hash = null;
$error = null;
if (($_SERVER['REQUEST_METHOD'] ?? 'GET') === 'POST') {
    $password = (string) ($_POST['password'] ?? '');
    if (mb_strlen($password) < 8) {
        $error = 'Bitte mindestens 8 Zeichen verwenden.';
    } else {
        $hash = password_hash($password, PASSWORD_DEFAULT);
    }
}
$e = static fn (string $s): string => htmlspecialchars($s, ENT_QUOTES, 'UTF-8');
?>
<!doctype html>
<html lang="de-CH">
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>Passwort-Hash · Sauna</title>
    <meta name="robots" content="noindex, nofollow">
    <style>
        :root { color-scheme: dark; }
        body { margin: 0; min-height: 100vh; display: grid; place-items: center; padding: 16px;
               font: 16px/1.5 system-ui, -apple-system, "Segoe UI", sans-serif; background: #161210; color: #f3ebe3; }
        main { width: min(100%, 34rem); background: #211a16; border: 1px solid rgba(255, 230, 200, .08);
               border-radius: 20px; padding: 28px; box-shadow: 0 20px 50px rgba(0, 0, 0, .45); }
        h1 { margin: 0 0 6px; font-size: 1.3rem; }
        p { color: #c9b8a8; margin: 0 0 16px; }
        label { display: block; font-weight: 600; margin-bottom: 6px; }
        input { width: 100%; box-sizing: border-box; padding: 12px 14px; border-radius: 12px; font: inherit;
                border: 1px solid rgba(255, 230, 200, .18); background: #161210; color: inherit; }
        input:focus-visible, button:focus-visible { outline: 3px solid #ff9a52; outline-offset: 2px; }
        button { margin-top: 14px; padding: 12px 18px; border: 0; border-radius: 12px; font: inherit; font-weight: 600;
                 background: linear-gradient(135deg, #ff8a3d, #e2412b); color: #1a0f0a; cursor: pointer; }
        code { display: block; margin-top: 8px; padding: 12px; border-radius: 12px; background: #161210;
               word-break: break-all; font-size: .9rem; color: #ffc98f; user-select: all; }
        .error { color: #ff8f7a; margin-top: 10px; }
    </style>
</head>
<body>
<main>
    <h1>Passwort-Hash erzeugen</h1>
    <p>Gib das gewünschte Passwort ein. Den erzeugten Hash in <strong>config.php</strong> bei
        <strong>auth → password_hash</strong> einfügen und <strong>enabled</strong> auf <strong>true</strong> setzen.</p>
    <form method="post">
        <label for="pw">Neues Passwort</label>
        <input id="pw" type="password" name="password" autocomplete="new-password" required minlength="8">
        <button type="submit">Hash erzeugen</button>
    </form>
    <?php if ($error): ?><p class="error" role="alert"><?= $e($error) ?></p><?php endif; ?>
    <?php if ($hash): ?>
        <p style="margin-top:18px">Hash (in config.php kopieren):</p>
        <code><?= $e($hash) ?></code>
        <p style="margin-top:14px">Danach diese Datei (<strong>tools/password_hash.php</strong>) löschen.</p>
    <?php endif; ?>
</main>
</body>
</html>
