<?php

declare(strict_types=1);

/**
 * Optionaler Passwortschutz für die Webseite und die lesenden API-Endpunkte.
 * Der ESP-Endpunkt api/insert.php nutzt stattdessen den API-Key.
 */
final class Auth
{
    private static bool $started = false;

    public static function enabled(): bool
    {
        return Config::bool('auth.enabled') && (string) Config::get('auth.password_hash', '') !== '';
    }

    /**
     * Ist der Schutz eingeschaltet, aber kein Hash hinterlegt, bleibt die
     * Seite gesperrt statt unbemerkt offen.
     */
    public static function misconfigured(): bool
    {
        return Config::bool('auth.enabled') && (string) Config::get('auth.password_hash', '') === '';
    }

    public static function start(): void
    {
        if (self::$started) {
            return;
        }
        self::$started = true;

        $days = max(1, Config::int('auth.remember_days', 30));
        $lifetime = $days * 86400;

        // Eigener Speicherort, damit der Hoster die Sitzungen nicht vorzeitig aufräumt.
        $dir = APP_ROOT . '/storage/sessions';
        if (is_dir($dir) && is_writable($dir)) {
            session_save_path($dir);
        }
        ini_set('session.gc_maxlifetime', (string) $lifetime);
        ini_set('session.use_strict_mode', '1');

        session_name('sauna_sid');
        session_set_cookie_params([
            'lifetime' => $lifetime,
            'path'     => self::basePath() . '/',
            'secure'   => self::isHttps(),
            'httponly' => true,
            'samesite' => 'Lax',
        ]);
        session_start();
    }

    public static function check(): bool
    {
        if (!self::enabled()) {
            return !self::misconfigured();
        }
        self::start();
        $auth = $_SESSION['auth'] ?? null;
        return is_array($auth) && ($auth['fp'] ?? null) === self::fingerprint();
    }

    /** Für Seiten: ohne Anmeldung zur Login-Seite umleiten. */
    public static function requirePage(): void
    {
        if (self::misconfigured()) {
            Http::fatal(new RuntimeException('auth misconfigured'), 'Der Passwortschutz ist eingeschaltet, aber in config.php ist kein Passwort-Hash hinterlegt.');
        }
        if (!self::check()) {
            header('Location: ' . self::basePath() . '/login.php');
            exit;
        }
        if (self::enabled()) {
            session_write_close();
        }
    }

    /** Für die API: ohne Anmeldung mit 401 antworten. */
    public static function requireApi(): void
    {
        if (self::misconfigured()) {
            throw new HttpException(500, 'auth_misconfigured', 'Der Passwortschutz ist eingeschaltet, aber es ist kein Passwort-Hash hinterlegt.');
        }
        if (!self::check()) {
            throw new HttpException(401, 'unauthorized', 'Bitte zuerst anmelden.');
        }
        if (self::enabled()) {
            // Sitzung sofort freigeben, damit parallele API-Aufrufe nicht warten.
            session_write_close();
        }
    }

    public static function attempt(string $password): bool
    {
        self::start();
        $hash = (string) Config::get('auth.password_hash', '');
        if ($hash !== '' && password_verify($password, $hash)) {
            session_regenerate_id(true);
            $_SESSION['auth'] = ['fp' => self::fingerprint(), 'at' => time()];
            unset($_SESSION['failed']);
            return true;
        }
        $_SESSION['failed'] = (int) ($_SESSION['failed'] ?? 0) + 1;
        // Bremst das Durchprobieren von Passwörtern.
        sleep(min(5, $_SESSION['failed']));
        return false;
    }

    public static function logout(): void
    {
        self::start();
        $_SESSION = [];
        $params = session_get_cookie_params();
        setcookie(session_name(), '', [
            'expires'  => time() - 3600,
            'path'     => $params['path'],
            'secure'   => $params['secure'],
            'httponly' => true,
            'samesite' => 'Lax',
        ]);
        session_destroy();
    }

    public static function csrfToken(): string
    {
        self::start();
        if (empty($_SESSION['csrf'])) {
            $_SESSION['csrf'] = bin2hex(random_bytes(16));
        }
        return $_SESSION['csrf'];
    }

    public static function verifyCsrf(?string $token): bool
    {
        self::start();
        return is_string($token) && !empty($_SESSION['csrf']) && hash_equals($_SESSION['csrf'], $token);
    }

    /**
     * Ändert sich das Passwort, werden alle bestehenden Anmeldungen ungültig.
     */
    private static function fingerprint(): string
    {
        return substr(hash('sha256', (string) Config::get('auth.password_hash', '')), 0, 16);
    }

    public static function isHttps(): bool
    {
        return (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off')
            || (($_SERVER['HTTP_X_FORWARDED_PROTO'] ?? '') === 'https')
            || (int) ($_SERVER['SERVER_PORT'] ?? 0) === 443;
    }

    /**
     * Pfad, unter dem die Seite liegt (leer im Hauptverzeichnis, sonst z. B. "/sauna").
     */
    public static function basePath(): string
    {
        $script = str_replace('\\', '/', (string) ($_SERVER['SCRIPT_NAME'] ?? ''));
        $dir = rtrim(dirname($script), '/');
        // API- und Tool-Skripte liegen eine Ebene tiefer.
        if (preg_match('#/(api|tools|maintenance)$#', $dir)) {
            $dir = rtrim(dirname($dir), '/');
        }
        return $dir === '.' ? '' : $dir;
    }
}
