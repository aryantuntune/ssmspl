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
import { colors, radii, spacing, text as t } from '../theme';

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
        <Pressable onPress={onClose} style={styles.back} hitSlop={10}>
          <Text style={styles.backText}>‹ Back</Text>
        </Pressable>
        <Text style={styles.title} numberOfLines={1}>
          {containerName}
        </Text>
        <Pressable onPress={load} disabled={busy} style={styles.refresh} hitSlop={10}>
          {busy ? <ActivityIndicator color={colors.textMuted} size="small" /> : <Text style={styles.refreshText}>↻</Text>}
        </Pressable>
      </View>

      <View style={styles.controls}>
        <TextInput
          style={styles.search}
          placeholder="Filter…"
          placeholderTextColor={colors.textFaint}
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
        <Pressable
          onPress={() => setAutoRefresh((v) => !v)}
          style={({ pressed }) => [styles.toggleBtn, pressed && { opacity: 0.6 }]}
        >
          <Text style={styles.toggleText}>
            {autoRefresh ? '⏸ pause auto-refresh' : '▶ resume auto-refresh'}
          </Text>
        </Pressable>
        <Text style={styles.lineCount}>{filtered.length} / {lines.length} lines</Text>
      </View>

      {error && (
        <View style={styles.errorBox}>
          <Text style={styles.errorIcon}>!</Text>
          <Text style={styles.errorText}>{error}</Text>
        </View>
      )}

      <ScrollView
        ref={scrollRef}
        style={styles.logBox}
        contentContainerStyle={styles.logContent}
        horizontal={false}
      >
        {filtered.map((ln, i) => {
          const sev = severity(ln);
          return (
            <Text key={i} style={[styles.logLine, sev ? { color: sev } : null]} selectable>
              {ln}
            </Text>
          );
        })}
        {filtered.length === 0 && !busy && (
          <Text style={styles.empty}>{filter ? 'no matches' : 'no log lines'}</Text>
        )}
      </ScrollView>
    </View>
  );
}

function severity(line: string): string | null {
  const u = line.toUpperCase();
  if (u.includes(' ERROR') || u.includes('TRACEBACK') || u.includes('CRITICAL')) return colors.critText;
  if (u.includes(' WARN') || u.includes('WARNING')) return colors.warnText;
  if (u.includes(' INFO')) return colors.textMuted;
  return null;
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: colors.bg },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
    paddingVertical: 10,
    borderBottomColor: colors.border,
    borderBottomWidth: 1,
  },
  back: { paddingVertical: 4, paddingHorizontal: 6 },
  backText: { color: colors.action.primary, fontSize: 14, fontWeight: '600' },
  title: { ...t.h2, flex: 1, textAlign: 'center', fontFamily: 'monospace', fontSize: 14 },
  refresh: { padding: 8 },
  refreshText: { color: colors.textMuted, fontSize: 18 },
  controls: { paddingHorizontal: spacing.md, paddingTop: spacing.sm, gap: spacing.sm },
  search: {
    backgroundColor: colors.bgElev,
    color: colors.text,
    borderRadius: radii.md,
    paddingHorizontal: spacing.md,
    paddingVertical: 8,
    fontSize: 13,
    borderWidth: 1,
    borderColor: colors.border,
  },
  lineBtns: { flexDirection: 'row', gap: 6 },
  linePill: {
    paddingHorizontal: spacing.md,
    paddingVertical: 4,
    backgroundColor: colors.bgElev,
    borderRadius: radii.pill,
    borderWidth: 1,
    borderColor: colors.border,
  },
  linePillActive: { backgroundColor: colors.action.primary, borderColor: colors.action.primaryBorder },
  linePillText: { color: colors.textMuted, fontSize: 12 },
  linePillTextActive: { color: colors.action.primaryText, fontWeight: '700' },
  toggleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
    paddingVertical: 8,
  },
  toggleBtn: { paddingVertical: 4 },
  toggleText: { color: colors.action.primary, fontSize: 12, fontWeight: '600' },
  lineCount: { color: colors.textDim, fontSize: 11 },
  errorBox: {
    flexDirection: 'row',
    gap: spacing.sm,
    backgroundColor: colors.critBg,
    borderLeftWidth: 3,
    borderLeftColor: colors.crit,
    paddingVertical: 10,
    paddingHorizontal: spacing.md,
    borderRadius: radii.sm,
    marginHorizontal: spacing.md,
    marginBottom: spacing.sm,
  },
  errorIcon: { color: colors.crit, fontWeight: '900', fontSize: 14, width: 14, textAlign: 'center' },
  errorText: { color: colors.critText, fontSize: 13, flex: 1, lineHeight: 18 },
  logBox: {
    flex: 1,
    backgroundColor: '#020617',
    marginHorizontal: spacing.md,
    marginBottom: spacing.md,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  logContent: { padding: 8 },
  logLine: { color: colors.textMuted, fontSize: 11, fontFamily: 'monospace', lineHeight: 14 },
  empty: { color: colors.textFaint, fontSize: 12, textAlign: 'center', padding: 20 },
});
