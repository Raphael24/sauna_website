<?php

declare(strict_types=1);

/**
 * Hilfsfunktionen für Tagesgrenzen in Europe/Zurich.
 *
 * In der Datenbank steht UTC. Ein Kalendertag in der Schweiz dauert wegen der
 * Zeitumstellung 23, 24 oder 25 Stunden; deshalb werden die Grenzen immer über
 * DateTimeImmutable in der lokalen Zeitzone berechnet.
 */
final class Time
{
    public static function zone(): DateTimeZone
    {
        static $zone = null;
        return $zone ??= new DateTimeZone(Config::get('timezone', 'Europe/Zurich'));
    }

    /** Heutiges Datum (YYYY-MM-DD) in der lokalen Zeitzone. */
    public static function today(): string
    {
        return (new DateTimeImmutable('now', self::zone()))->format('Y-m-d');
    }

    /**
     * Prüft ein Datum im Format YYYY-MM-DD auf Gültigkeit.
     */
    public static function parseDate(string $date): DateTimeImmutable
    {
        $d = DateTimeImmutable::createFromFormat('!Y-m-d', $date, self::zone());
        if ($d === false || $d->format('Y-m-d') !== $date) {
            throw new HttpException(400, 'invalid_date', 'Das Datum ist ungültig.');
        }
        return $d;
    }

    /**
     * Unix-Zeitstempel für Beginn und Ende (exklusiv) eines lokalen Tages.
     *
     * @return array{0: int, 1: int}
     */
    public static function dayBounds(string $date): array
    {
        $start = self::parseDate($date);
        return [$start->getTimestamp(), $start->modify('+1 day')->getTimestamp()];
    }

    /** Lokales Datum (YYYY-MM-DD) eines Unix-Zeitstempels. */
    public static function localDate(int $ts): string
    {
        return (new DateTimeImmutable('@' . $ts))->setTimezone(self::zone())->format('Y-m-d');
    }

    /** Unix-Zeitstempel als UTC-String für Datenbankabfragen. */
    public static function utc(int $ts): string
    {
        return gmdate('Y-m-d H:i:s', $ts);
    }

    /** Alle Daten von $from bis $to (inklusive), jeweils YYYY-MM-DD. */
    public static function dateRange(string $from, string $to): array
    {
        $dates = [];
        $cur = self::parseDate($from);
        $end = self::parseDate($to);
        while ($cur <= $end) {
            $dates[] = $cur->format('Y-m-d');
            $cur = $cur->modify('+1 day');
        }
        return $dates;
    }

    /** Millisekunden für JavaScript. */
    public static function ms(?int $ts): ?int
    {
        return $ts === null ? null : $ts * 1000;
    }
}
