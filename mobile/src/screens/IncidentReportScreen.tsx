import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { fetchIncidentReport, type IncidentReport } from '../api/systemActions';
import { colors, radii, spacing, text as t } from '../theme';

export default function IncidentReportScreen({ onClose }: { onClose: () => void }) {
  const [report, setReport] = useState<IncidentReport | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setReport(await fetchIncidentReport(200));
    } catch (e: any) {
      const detail = e?.response?.data?.detail || e?.message || 'Failed';
      setError(typeof detail === 'string' ? detail : JSON.stringify(detail));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const onShare = async () => {
    if (!report) return;
    try {
      await Share.share({
        title: 'SSMSPL Incident Report',
        message: formatReportPlainText(report),
      });
    } catch {
      // user cancelled
    }
  };

  return (
    <View style={styles.flex}>
      <View style={styles.header}>
        <Pressable onPress={onClose} style={styles.back} hitSlop={10}>
          <Text style={styles.backText}>‹ Back</Text>
        </Pressable>
        <Text style={styles.title}>Incident report</Text>
        <Pressable onPress={load} disabled={loading} style={styles.refresh} hitSlop={10}>
          {loading ? (
            <ActivityIndicator size="small" color={colors.textMuted} />
          ) : (
            <Text style={styles.refreshText}>↻</Text>
          )}
        </Pressable>
      </View>

      {report && (
        <View style={styles.actions}>
          <Pressable
            onPress={onShare}
            style={({ pressed }) => [styles.actionBtn, pressed && { opacity: 0.7 }]}
          >
            <Text style={styles.actionBtnText}>Share report</Text>
          </Pressable>
        </View>
      )}

      <ScrollView contentContainerStyle={styles.scroll}>
        {error && (
          <View style={styles.errorBox}>
            <Text style={styles.errorIcon}>!</Text>
            <Text style={styles.errorText}>{error}</Text>
          </View>
        )}
        {loading && !report && (
          <View style={styles.center}>
            <ActivityIndicator color={colors.action.primary} />
            <Text style={styles.dim}>Bundling logs, events, activity…</Text>
          </View>
        )}

        {report && (
          <>
            <Section title="Generated">
              <Row label="At" value={report.generated_at} />
              <Row label="From version" value={report.version.git_sha.slice(0, 10)} />
              <Row label="Build" value={report.version.build_ts} />
              <Row label="Schema head" value={report.version.alembic_head.slice(0, 10)} />
            </Section>

            <Section title="Containers">
              {report.containers.map((c: any) => (
                <View key={c.name} style={styles.subBlock}>
                  <Text style={styles.subTitle}>{c.name}</Text>
                  {c.error ? (
                    <Text style={styles.errLine}>{c.error}</Text>
                  ) : (
                    <>
                      <Row label="Status" value={`${c.status}${c.health ? ' · ' + c.health : ''}`} />
                      <Row label="Restarts" value={String(c.restart_count ?? 0)} />
                      <Row label="Image" value={c.image ?? '?'} />
                    </>
                  )}
                </View>
              ))}
            </Section>

            <Section title={`Recent events (${report.events.length})`}>
              {report.events.length === 0 ? (
                <Text style={styles.dim}>No recent events.</Text>
              ) : (
                report.events.slice(0, 12).map((e) => (
                  <View key={e.id} style={styles.eventRow}>
                    <Text style={[styles.sevDot, sevColor(e.severity)]}>● </Text>
                    <View style={styles.eventBody}>
                      <Text style={styles.eventTitle}>{e.check_name}</Text>
                      <Text style={styles.eventMsg} numberOfLines={3}>
                        {e.message}
                      </Text>
                      <Text style={styles.dim}>
                        {(e.created_at ?? '').slice(0, 19).replace('T', ' ')} · {e.server_name}
                        {e.acked_at ? ' · acked' : ''}
                      </Text>
                    </View>
                  </View>
                ))
              )}
            </Section>

            <Section title={`Recent activity (${report.activity.length})`}>
              {report.activity.slice(0, 12).map((a) => (
                <View key={a.id ?? Math.random()} style={styles.activityRow}>
                  <Text style={styles.activityType}>{a.action_type}</Text>
                  <Text style={styles.dim}>{(a.created_at ?? '').slice(0, 19).replace('T', ' ')}</Text>
                </View>
              ))}
            </Section>

            {Object.entries(report.container_logs).map(([name, lines]) => (
              <Section key={name} title={`${name} logs (${lines.length} lines)`}>
                <View style={styles.logBox}>
                  {lines.slice(-100).map((ln, i) => (
                    <Text
                      key={i}
                      style={[styles.logLine, lineColor(ln) ? { color: lineColor(ln)! } : null]}
                      selectable
                    >
                      {ln}
                    </Text>
                  ))}
                </View>
              </Section>
            ))}
          </>
        )}
      </ScrollView>
    </View>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{title}</Text>
      {children}
    </View>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.row}>
      <Text style={styles.rowLabel}>{label}</Text>
      <Text style={styles.rowValue} numberOfLines={2}>
        {value}
      </Text>
    </View>
  );
}

function sevColor(sev: string): { color: string } {
  if (sev === 'CRIT') return { color: colors.crit };
  if (sev === 'WARN') return { color: colors.warn };
  return { color: colors.info };
}

function lineColor(line: string): string | null {
  const u = line.toUpperCase();
  if (u.includes(' ERROR') || u.includes('TRACEBACK') || u.includes('CRITICAL')) return colors.critText;
  if (u.includes(' WARN') || u.includes('WARNING')) return colors.warnText;
  return null;
}

function formatReportPlainText(r: IncidentReport): string {
  const lines: string[] = [];
  lines.push(`SSMSPL Incident Report — ${r.generated_at}`);
  lines.push(`Version: ${r.version.git_sha} (${r.version.image_tag})`);
  lines.push(`Schema head: ${r.version.alembic_head}`);
  lines.push('');
  lines.push('--- Containers ---');
  for (const c of r.containers as any[]) {
    if (c.error) {
      lines.push(`  ${c.name}: ERROR — ${c.error}`);
    } else {
      lines.push(`  ${c.name}: ${c.status}${c.health ? ' / ' + c.health : ''} (restarts ${c.restart_count ?? 0})`);
    }
  }
  lines.push('');
  lines.push(`--- Events (${r.events.length}) ---`);
  for (const e of r.events.slice(0, 10)) {
    lines.push(`  [${e.severity}] ${e.created_at?.slice(0, 19)} · ${e.check_name}: ${e.message.slice(0, 120)}`);
  }
  lines.push('');
  for (const [name, ls] of Object.entries(r.container_logs)) {
    lines.push(`--- ${name} logs (last 50 of ${ls.length}) ---`);
    for (const ln of ls.slice(-50)) lines.push('  ' + ln);
    lines.push('');
  }
  return lines.join('\n');
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: colors.bg },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.md,
    paddingVertical: 10,
    borderBottomColor: colors.border,
    borderBottomWidth: 1,
  },
  back: { paddingVertical: 4, paddingHorizontal: 6 },
  backText: { color: colors.action.primary, fontSize: 14, fontWeight: '600' },
  title: { ...t.h1, fontSize: 17 },
  refresh: { padding: 8 },
  refreshText: { color: colors.textMuted, fontSize: 18 },
  actions: { flexDirection: 'row', gap: 10, padding: spacing.md },
  actionBtn: {
    flex: 1,
    backgroundColor: colors.action.primary,
    borderWidth: 1,
    borderColor: colors.action.primaryBorder,
    paddingVertical: 10,
    borderRadius: radii.md,
    alignItems: 'center',
  },
  actionBtnText: { color: colors.action.primaryText, fontSize: 13, fontWeight: '700' },
  scroll: { padding: spacing.lg, paddingBottom: 40 },
  center: { paddingTop: 60, alignItems: 'center' },
  dim: { ...t.meta, marginTop: 4 },
  errorBox: {
    flexDirection: 'row',
    gap: spacing.sm,
    backgroundColor: colors.critBg,
    borderLeftWidth: 3,
    borderLeftColor: colors.crit,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.md,
    borderRadius: radii.sm,
    marginBottom: spacing.md,
  },
  errorIcon: { color: colors.crit, fontWeight: '900', fontSize: 14, width: 14, textAlign: 'center' },
  errorText: { color: colors.critText, fontSize: 13, flex: 1, lineHeight: 18 },
  section: { marginBottom: spacing.md },
  sectionTitle: {
    ...t.section,
    marginBottom: spacing.sm,
  },
  subBlock: {
    backgroundColor: colors.bgElev,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    borderRadius: radii.md,
    marginBottom: 8,
    borderLeftWidth: 2,
    borderLeftColor: colors.border,
  },
  subTitle: { color: colors.text, fontSize: 13, fontWeight: '700', marginBottom: 6 },
  row: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 3, gap: spacing.md },
  rowLabel: { color: colors.textMuted, fontSize: 12 },
  rowValue: { color: colors.text, fontSize: 12, fontWeight: '600', maxWidth: '60%', textAlign: 'right' },
  errLine: { color: colors.critText, fontSize: 11 },
  eventRow: {
    flexDirection: 'row',
    backgroundColor: colors.bgElev,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    borderRadius: radii.md,
    marginBottom: 6,
  },
  sevDot: { fontSize: 16 },
  eventBody: { flex: 1, marginLeft: 4 },
  eventTitle: { color: colors.text, fontSize: 12, fontWeight: '700' },
  eventMsg: { color: colors.textMuted, fontSize: 12, marginTop: 2 },
  activityRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 4,
    paddingHorizontal: spacing.md,
    backgroundColor: colors.bgElev,
    borderRadius: radii.sm,
    marginBottom: 4,
  },
  activityType: { color: colors.textMuted, fontSize: 11, fontFamily: 'monospace' },
  logBox: { backgroundColor: '#020617', padding: 8, borderRadius: radii.sm, borderWidth: 1, borderColor: colors.border },
  logLine: { color: colors.textMuted, fontSize: 10, fontFamily: 'monospace', lineHeight: 13 },
});
