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
        <Pressable onPress={onClose} style={styles.back}>
          <Text style={styles.backText}>← back</Text>
        </Pressable>
        <Text style={styles.title}>Incident report</Text>
        <Pressable onPress={load} disabled={loading} style={styles.refresh}>
          {loading ? <ActivityIndicator size="small" color="#cbd5e1" /> : <Text style={styles.refreshText}>↻</Text>}
        </Pressable>
      </View>

      {report && (
        <View style={styles.actions}>
          <Pressable onPress={onShare} style={styles.actionBtn}>
            <Text style={styles.actionBtnText}>Share report</Text>
          </Pressable>
        </View>
      )}

      <ScrollView contentContainerStyle={styles.scroll}>
        {error && <Text style={styles.error}>{error}</Text>}
        {loading && !report && (
          <View style={styles.center}>
            <ActivityIndicator color="#3b82f6" />
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
  if (sev === 'CRIT') return { color: '#f87171' };
  if (sev === 'WARN') return { color: '#fbbf24' };
  return { color: '#60a5fa' };
}

function lineColor(line: string): string | null {
  const u = line.toUpperCase();
  if (u.includes(' ERROR') || u.includes('TRACEBACK') || u.includes('CRITICAL')) return '#fca5a5';
  if (u.includes(' WARN') || u.includes('WARNING')) return '#fcd34d';
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
  flex: { flex: 1, backgroundColor: '#0b1220' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderBottomColor: '#1e293b',
    borderBottomWidth: 1,
  },
  back: { paddingVertical: 4, paddingHorizontal: 6 },
  backText: { color: '#cbd5e1', fontSize: 14 },
  title: { color: '#f8fafc', fontSize: 17, fontWeight: '600' },
  refresh: { padding: 8 },
  refreshText: { color: '#cbd5e1', fontSize: 18 },
  actions: { flexDirection: 'row', gap: 10, padding: 12 },
  actionBtn: {
    flex: 1,
    backgroundColor: '#1e293b',
    borderWidth: 1,
    borderColor: '#334155',
    paddingVertical: 8,
    borderRadius: 8,
    alignItems: 'center',
  },
  actionBtnText: { color: '#cbd5e1', fontSize: 12, fontWeight: '600' },
  scroll: { padding: 16, paddingBottom: 40 },
  center: { paddingTop: 60, alignItems: 'center' },
  dim: { color: '#94a3b8', fontSize: 12, marginTop: 4 },
  error: {
    color: '#ef4444',
    backgroundColor: '#7f1d1d20',
    padding: 10,
    borderRadius: 8,
    marginBottom: 12,
    fontSize: 13,
  },
  section: { marginBottom: 16 },
  sectionTitle: {
    color: '#cbd5e1',
    fontSize: 13,
    fontWeight: '600',
    letterSpacing: 0.5,
    textTransform: 'uppercase',
    marginBottom: 8,
  },
  subBlock: {
    backgroundColor: '#1e293b',
    padding: 10,
    borderRadius: 8,
    marginBottom: 8,
  },
  subTitle: { color: '#f8fafc', fontSize: 13, fontWeight: '600', marginBottom: 6 },
  row: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 3 },
  rowLabel: { color: '#94a3b8', fontSize: 12 },
  rowValue: { color: '#e2e8f0', fontSize: 12, fontWeight: '500', maxWidth: '60%' },
  errLine: { color: '#f87171', fontSize: 11 },
  eventRow: {
    flexDirection: 'row',
    backgroundColor: '#1e293b',
    padding: 10,
    borderRadius: 8,
    marginBottom: 6,
  },
  sevDot: { fontSize: 16 },
  eventBody: { flex: 1, marginLeft: 4 },
  eventTitle: { color: '#f8fafc', fontSize: 12, fontWeight: '600' },
  eventMsg: { color: '#cbd5e1', fontSize: 12, marginTop: 2 },
  activityRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 4,
    paddingHorizontal: 10,
    backgroundColor: '#1e293b',
    borderRadius: 6,
    marginBottom: 4,
  },
  activityType: { color: '#cbd5e1', fontSize: 11, fontFamily: 'monospace' },
  logBox: { backgroundColor: '#020617', padding: 8, borderRadius: 6 },
  logLine: { color: '#cbd5e1', fontSize: 10, fontFamily: 'monospace', lineHeight: 13 },
});
