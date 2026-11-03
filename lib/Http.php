<?php

declare(strict_types=1);

/**
 * Fehler, die mit einem bestimmten HTTP-Status beantwortet werden.
 */
final class HttpException extends RuntimeException
{
    public function __construct(
        public readonly int $status,
        public readonly string $errorCode,
        string $message,
    ) {
        parent::__construct($message);
    }
}

/**
 * JSON-Antworten und einheitliche Fehlerbehandlung für die API.
 */
final class Http
{
    private static bool $isApi = false;

    /**
     * Markiert die aktuelle Anfrage als API-Aufruf: Fehler werden als JSON
     * beantwortet, nicht als HTML-Seite.
     */
    public static function api(): void
    {
        self::$isApi = true;
        header('Content-Type: application/json; charset=utf-8');
        header('Cache-Control: no-store');
        header('X-Content-Type-Options: nosniff');

        set_exception_handler(static function (Throwable $e): void {
            if ($e instanceof HttpException) {
                self::error($e->status, $e->errorCode, $e->getMessage());
            }
            self::fatal($e);
        });
    }

    /**
     * @param array<string, mixed>|list<mixed> $data
     */
    public static function json(array $data, int $status = 200): never
    {
        http_response_code($status);
        echo json_encode($data, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_THROW_ON_ERROR);
        exit;
    }

    public static function error(int $status, string $code, string $message): never
    {
        if (!headers_sent()) {
            header('Content-Type: application/json; charset=utf-8');
            header('Cache-Control: no-store');
        }
        self::json(['error' => ['code' => $code, 'message' => $message]], $status);
    }

    /**
     * Unerwarteter Fehler: protokollieren und mit 500 antworten.
     * Details werden nur im Debug-Modus ausgegeben.
     */
    public static function fatal(Throwable $e, ?string $publicMessage = null): never
    {
        error_log('[sauna] ' . get_class($e) . ': ' . $e->getMessage() . ' in ' . $e->getFile() . ':' . $e->getLine());

        $message = $publicMessage ?? 'Auf dem Server ist ein Fehler aufgetreten. Bitte später erneut versuchen.';
        $debug = class_exists('Config', false) && Config::debug();
        if ($e instanceof PDOException) {
            $message = $publicMessage ?? 'Die Datenbank ist nicht erreichbar. Bitte die Zugangsdaten in config.php prüfen.';
        }
        if ($debug || $publicMessage !== null && str_contains($e->getMessage(), 'config.php')) {
            $message .= ' (' . $e->getMessage() . ')';
        }

        $isApiScript = str_contains(str_replace('\\', '/', (string) ($_SERVER['SCRIPT_NAME'] ?? '')), '/api/');
        if (self::$isApi || $isApiScript || PHP_SAPI === 'cli') {
            if (PHP_SAPI === 'cli') {
                fwrite(STDERR, $message . PHP_EOL);
                exit(1);
            }
            self::error(500, 'server_error', $message);
        }

        if (!headers_sent()) {
            http_response_code(500);
            header('Content-Type: text/html; charset=utf-8');
        }
        $safe = htmlspecialchars($message, ENT_QUOTES, 'UTF-8');
        echo <<<HTML
            <!doctype html>
            <html lang="de-CH"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
            <title>Fehler · Sauna</title>
            <style>body{font:16px/1.5 system-ui,sans-serif;background:#161210;color:#f3ebe3;display:grid;place-items:center;min-height:100vh;margin:0;padding:16px}
            main{max-width:32rem;background:#211a16;border-radius:16px;padding:28px;box-shadow:0 10px 30px rgba(0,0,0,.4)}h1{margin:0 0 8px;font-size:1.25rem}p{margin:0;color:#c9b8a8}</style>
            </head><body><main><h1>Etwas ist schiefgelaufen</h1><p>{$safe}</p></main></body></html>
            HTML;
        exit;
    }

    public static function requireMethod(string ...$methods): void
    {
        $method = $_SERVER['REQUEST_METHOD'] ?? 'GET';
        if (!in_array($method, $methods, true)) {
            header('Allow: ' . implode(', ', $methods));
            throw new HttpException(405, 'method_not_allowed', 'Diese Methode ist hier nicht erlaubt. Erlaubt: ' . implode(', ', $methods) . '.');
        }
    }

    /**
     * Liest einen GET-Parameter, der einem Muster entsprechen muss.
     */
    public static function query(string $name, string $pattern, ?string $default = null): string
    {
        $value = $_GET[$name] ?? $default;
        if (!is_string($value) || $value === '') {
            throw new HttpException(400, 'missing_parameter', "Der Parameter «{$name}» fehlt.");
        }
        if (!preg_match($pattern, $value)) {
            throw new HttpException(400, 'invalid_parameter', "Der Parameter «{$name}» hat ein ungültiges Format.");
        }
        return $value;
    }
}
