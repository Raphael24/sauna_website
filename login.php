<?php
/**
 * Anmeldung, falls der Passwortschutz in config.php eingeschaltet ist.
 */

declare(strict_types=1);

require __DIR__ . '/lib/bootstrap.php';

if (!Auth::enabled()) {
    header('Location: ./');
    exit;
}
if (Auth::check()) {
    header('Location: ./');
    exit;
}

$error = null;
if (($_SERVER['REQUEST_METHOD'] ?? 'GET') === 'POST') {
    if (!Auth::verifyCsrf($_POST['csrf'] ?? null)) {
        $error = 'Die Sitzung ist abgelaufen. Bitte noch einmal versuchen.';
    } elseif (Auth::attempt((string) ($_POST['password'] ?? ''))) {
        header('Location: ./', true, 303);
        exit;
    } else {
        $error = 'Das Passwort ist falsch.';
    }
}

$csrf = Auth::csrfToken();
$v = static fn (string $path): string => htmlspecialchars($path . '?v=' . (is_file(__DIR__ . '/' . $path) ? filemtime(__DIR__ . '/' . $path) : 0), ENT_QUOTES, 'UTF-8');

header('Content-Type: text/html; charset=utf-8');
header('Cache-Control: no-store');
?>
<!doctype html>
<html lang="de-CH">
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>Anmelden · Sauna</title>
    <meta name="color-scheme" content="dark light">
    <meta name="robots" content="noindex, nofollow">
    <link rel="icon" type="image/svg+xml" href="<?= $v('assets/img/favicon.svg') ?>">
    <script src="<?= $v('assets/js/theme-init.js') ?>"></script>
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,400..650&family=Inter:wght@300..700&display=swap">
    <link rel="stylesheet" href="<?= $v('assets/css/tokens.css') ?>">
    <link rel="stylesheet" href="<?= $v('assets/css/base.css') ?>">
    <link rel="stylesheet" href="<?= $v('assets/css/components.css') ?>">
    <link rel="stylesheet" href="<?= $v('assets/css/login.css') ?>">
</head>
<body class="login-page">
<main class="login-card">
    <div class="login-mark" aria-hidden="true">
        <svg viewBox="0 0 32 32" width="44" height="44"><defs><linearGradient id="login-flame" x1="0" y1="1" x2="0" y2="0"><stop offset="0" stop-color="#e2412b"/><stop offset=".6" stop-color="#ff7a2f"/><stop offset="1" stop-color="#ffc25a"/></linearGradient></defs><path fill="url(#login-flame)" d="M16.6 2.5c.5 4.2-1.6 6.4-3.7 8.6-2.3 2.4-4.7 4.9-4.7 9.3A7.9 7.9 0 0 0 16 28.5a7.9 7.9 0 0 0 7.8-8c0-3.4-1.6-5.6-3-7.4.1 2.1-.6 3.6-2 4.4.6-4.7-.3-10.4-2.2-15z"/><path fill="#ffe2a8" opacity=".85" d="M16.2 27.3a3.9 3.9 0 0 1-3.9-4c0-2.2 1.5-3.3 2.6-4.6.4 1.4 1.3 2 2.4 2.3a4 4 0 0 1 2.8 2.7 3.9 3.9 0 0 1-3.9 3.6z"/></svg>
    </div>
    <h1 class="login-title">Willkommen zurück</h1>
    <p class="login-sub">Bitte gib das Passwort ein, um die Saunadaten zu sehen.</p>

    <form method="post" class="login-form" novalidate>
        <input type="hidden" name="csrf" value="<?= htmlspecialchars($csrf, ENT_QUOTES, 'UTF-8') ?>">
        <label class="field">
            <span class="field-label">Passwort</span>
            <input class="input" type="password" name="password" autocomplete="current-password" required autofocus
                   <?= $error ? 'aria-invalid="true" aria-describedby="login-error"' : '' ?>>
        </label>
        <?php if ($error): ?>
            <p class="form-error" id="login-error" role="alert"><?= htmlspecialchars($error, ENT_QUOTES, 'UTF-8') ?></p>
        <?php endif; ?>
        <button class="btn btn--primary btn--block" type="submit">Anmelden</button>
    </form>
</main>
</body>
</html>
