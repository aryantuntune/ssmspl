import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import { tailContainerLogs } from '../api/systemActions';

const REFRESH_MS = 5_000;
const DEFAULT_LINES = 200;

export default function LogsScreen({
  containerName,
  onClose,
}: {
  containerName: string;
  onClose: () => void;
}) {
  const [lines, setLines] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [count, setCount] = useState(DEFAULT_LINES);
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [busy, setBusy] = useState(false);
  const [filter, setFilter] = useState('');
  const scrollRef = useRef<ScrollView>(null);

  const load = useCallback(async () => {
    setBusy(true);
    setError(null);
    try {
      const r = await tailContainerLogs(containerName, count);
      setLines(r.lines);
      requestAnimationFrame(() => scrollRef.current?.scrollToEnd({ animated: false }));
    } catch (e: any) {
      const detail = e?.response?.data?.detail || e?.message || 'Failed';
      setError(typeof detail === 'string' ? detail : 'Failed');
    } finally {
      setBusy(false);
    }
  }, [containerName, count]);

  useEffect(() => {
    load();
    if (!autoRefresh) return;
    const id = setInterval(load, REFRESH_MS);
    return () => clearInterval(id);
  }, [load, autoRefresh]);

  const filtered = filter
    ? lines.filter((l) => l.toLowerCase().includes(filter.toLowerCase()))
    : lines;

  return (
    <View style={styles.flex}>
      <View style={styles.header}>
        <Pressable onPress={onClose} style={styles.back}>
          <Text style={styles.backText}>← back</Text>
        </Pressable>
        <Text style={styles.title} numberOfLines={1}>
          {containerName}
        </Text>
        <Pressable onPress={load} disabled={busy} style={styles.refresh}>
          {busy ? <ActivityIndicator color="#cbd5e1" size="small" /> : <Text style={styles.refreshText}>↻</Text>}
        </Pressable>
      </View>

      <View style={styles.controls}>
        <TextInput
          style={styles.search}
          placeholder="Filter…"
          placeholderTextColor="#64748b"
          value={filter}
          onChangeText={setFilter}
          autoCapitalize="none"
          autoCorrect={false}
        />
        <View style={styles.lineBtns}>
          {[100, 200, 500, 1000].map((n) => (
            <Pressable
              key={n}
              onPress={() => setCount(n)}
              style={[styles.linePill, count === n && styles.linePillActive]}
            >
              <Text style={[styles.linePillText, count === n && styles.linePillTextActive]}>{n}</Text>
            </Pressable>
          ))}
        </View>
      </View>

      <View style={styles.toggleRow}>
        <Pressable onPress={() => setAutoRefresh((v) => !v)} style={styles.toggleBtn}>
          <Text style={styles.toggleText}>
            {autoRefresh ? '⏸ pause auto-refresh' : '▶ resume auto-refresh'}
          </Text>
        </Pressable>
        <Text style={styles.lineCount}>{filtered.length} / {lines.length} lines</Text>
      </View>

      {error && <Text style={styles.error}>{error}</Text>}

      <ScrollView
        ref={scrollRef}
        style={styles.logBox}
        contentContainerStyle={styles.logContent}
        horizontal={false}
      >
        {filtered.map((ln, i) => (
          <Text key={i} style={[styles.logLine, severity(ln) ? { color: severity(ln) } : null]} selectable>
            {ln}
          </Text>
        ))}
        {filtered.length === 0 && !busy && (
          <Text style={styles.empty}>{filter ? 'no matches' : 'no log lines'}</Text>
        )}
      </ScrollView>
    </View>
  );
}

function severity(line: string): string | null {
  const u = line.toUpperCase();
  if (u.includes(' ERROR') || u.includes('TRACEBACK') || u.includes('CRITICAL')) return '#fca5a5';
  if (u.includes(' WARN') || u.includes('WARNING')) return '#fcd34d';
  if (u.includes(' INFO')) return '#cbd5e1';
  return null;
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: '#0b1220' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderBottomColor: '#1e293b',
    borderBottomWidth: 1,
  },
  back: { paddingVertical: 4, paddingHorizontal: 6 },
  backText: { color: '#cbd5e1', fontSize: 14 },
  title: { color: '#f8fafc', fontSize: 16, fontWeight: '600', flex: 1, textAlign: 'center' },
  refresh: { padding: 8 },
  refreshText: { color: '#cbd5e1', fontSize: 18 },
  controls: { paddingHorizontal: 12, paddingTop: 8, gap: 8 },
  search: {
    backgroundColor: '#1e293b',
    color: '#e2e8f0',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    fontSize: 13,
  },
  lineBtns: { flexDirection: 'row', gap: 6 },
  linePill: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    backgroundColor: '#1e293b',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#334155',
  },
  linePillActive: { backgroundColor: '#1e3a8a', borderColor: '#1d4ed8' },
  linePillText: { color: '#94a3b8', fontSize: 12 },
  linePillTextActive: { color: '#dbeafe', fontWeight: '600' },
  toggleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  toggleBtn: { paddingVertical: 4 },
  toggleText: { color: '#60a5fa', fontSize: 12 },
  lineCount: { color: '#64748b', fontSize: 11 },
  error: {
    color: '#ef4444',
    backgroundColor: '#7f1d1d20',
    padding: 10,
    borderRadius: 8,
    margin: 12,
    fontSize: 13,
  },
  logBox: { flex: 1, backgroundColor: '#020617', marginHorizontal: 12, marginBottom: 12, borderRadius: 8 },
  logContent: { padding: 8 },
  logLine: { color: '#cbd5e1', fontSize: 11, fontFamily: 'monospace', lineHeight: 14 },
  empty: { color: '#475569', fontSize: 12, textAlign: 'center', padding: 20 },
});
