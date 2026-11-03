<?php

declare(strict_types=1);

/**
 * PDO-Verbindung zur MySQL-Datenbank. Die Verbindung arbeitet in UTC,
 * damit UNIX_TIMESTAMP() und die gespeicherten Zeitstempel übereinstimmen.
 */
final class Database
{
    private static ?PDO $pdo = null;

    public static function pdo(): PDO
    {
        if (self::$pdo !== null) {
            return self::$pdo;
        }

        $dsn = sprintf(
            'mysql:host=%s;port=%d;dbname=%s;charset=%s',
            Config::get('db.host', 'localhost'),
            Config::int('db.port', 3306),
            Config::get('db.name', ''),
            Config::get('db.charset', 'utf8mb4'),
        );

        self::$pdo = new PDO($dsn, (string) Config::get('db.user', ''), (string) Config::get('db.pass', ''), [
            PDO::ATTR_ERRMODE            => PDO::ERRMODE_EXCEPTION,
            PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
            PDO::ATTR_EMULATE_PREPARES   => false,
            PDO::ATTR_STRINGIFY_FETCHES  => false,
        ]);
        self::$pdo->exec("SET time_zone = '+00:00'");

        return self::$pdo;
    }
}
