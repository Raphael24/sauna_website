<?php
/**
 * Abmelden und zurück zur Login-Seite.
 */

declare(strict_types=1);

require __DIR__ . '/lib/bootstrap.php';

if (Auth::enabled()) {
    Auth::logout();
    header('Location: login.php', true, 303);
} else {
    header('Location: ./', true, 303);
}
exit;
