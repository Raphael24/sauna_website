<?php
/**
 * Löscht Messwerte, die älter als `retention.years` Jahre sind.
 * Standardmässig ausgeschaltet (config.php → retention → enabled).
 *
 * Nur über die Kommandozeile bzw. einen Cronjob aufrufbar, z. B. in hPanel →
 * Erweitert → Cronjobs, einmal pro Woche:
 *   /usr/bin/php /home/uXXXXXXXX/domains/DEINE-DOMAIN/public_html/maintenance/cleanup.php
 *
 * Option --dry-run zeigt nur an, wie viele Zeilen gelöscht würden.
 */

declare(strict_types=1);

if (PHP_SAPI !== 'cli') {
    http_response_code(403);
    header('Content-Type: text/plain; charset=utf-8');
    echo "Dieses Skript läuft nur als Cronjob bzw. über die Kommandozeile.\n";
    exit;
}

require __DIR__ . '/../lib/bootstrap.php';

$dryRun = in_array('--dry-run', $argv, true);

if (!Config::bool('retention.enabled')) {
    echo "Aufräumen ist ausgeschaltet (config.php → retention → enabled). Nichts zu tun.\n";
    exit(0);
}

$years = max(1, Config::int('retention.years', 5));
$cutoff = (new DateTimeImmutable('today', Time::zone()))->modify("-{$years} years");
$cutoffUtc = Time::utc($cutoff->getTimestamp());

$pdo = Database::pdo();

$count = $pdo->prepare('SELECT COUNT(*) FROM measurements WHERE ts < :cutoff');
$count->execute([':cutoff' => $cutoffUtc]);
$total = (int) $count->fetchColumn();

printf("Messwerte vor dem %s: %d\n", $cutoff->format('d.m.Y'), $total);

if ($dryRun || $total === 0) {
    echo $dryRun ? "Testlauf – nichts gelöscht.\n" : "Nichts zu löschen.\n";
    exit(0);
}

// In Portionen löschen, damit die Tabelle nicht lange gesperrt ist.
$delete = $pdo->prepare('DELETE FROM measurements WHERE ts < :cutoff ORDER BY ts LIMIT 10000');
$deleted = 0;
do {
    $delete->execute([':cutoff' => $cutoffUtc]);
    $n = $delete->rowCount();
    $deleted += $n;
} while ($n > 0);

$summary = $pdo->prepare('DELETE FROM daily_summary WHERE day < :day');
$summary->execute([':day' => $cutoff->format('Y-m-d')]);

printf("%d Messwerte gelöscht.\n", $deleted);
