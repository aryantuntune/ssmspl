import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import {
  listReleases,
  rollbackToRelease,
  type ReleaseEntry,
  type VersionInfo,
} from '../api/systemActions';
import { colors, radii, spacing, text as t } from '../theme';

export default function VersionsScreen({ onClose }: { onClose: () => void }) {
  const [current, setCurrent] = useState<VersionInfo | null>(null);
  const [releases, setReleases] = useState<ReleaseEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busyTag, setBusyTag] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const r = await listReleases(20);
      setCurrent(r.current);
      setReleases(r.releases);
    } catch (e: any) {
      const detail = e?.response?.data?.detail || e?.message || 'Failed to load';
      setError(typeof detail === 'string' ? detail : JSON.stringify(detail));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const onRollback = (entry: ReleaseEntry, force = false) => {
    Alert.alert(
      `Roll back to ${entry.git_sha.slice(0, 7)}?`,
      `Switches admin-backend to image\n${entry.image_tag}\n\nNo database changes — code only. ~30s downtime while the container restarts.\n\nIf the new (older) version fails health checks, you can roll forward again from this same screen.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Roll back',
          style: 'destructive',
          onPress: async () => {
            setBusyTag(entry.image_tag);
            try {
              const r = await rollbackToRelease(entry.image_tag, force);
              if (r.ok) {
                Alert.alert(
                  'Rollback submitted',
                  'Container is being recreated. Health will recover in ~30s — pull to refresh.',
                );
                setTimeout(load, 8000);
              } else {
                Alert.alert('Rollback failed', r.error ?? 'unknown');
              }
            } catch (e: any) {
              const status = e?.response?.status;
              const detail = e?.response?.data?.detail;
              if (status === 412 && detail?.schema_drift) {
                Alert.alert(
                  'Schema mismatch',
                  `${detail.message}\n\nThis older version was built when the database schema was at ${detail.target_head}, but the live DB is now at ${detail.current_head}.\n\nProceeding may break reads/writes for columns that didn't exist yet OR have since been removed.`,
                  [
                    { text: 'Cancel', style: 'cancel' },
                    {
                      text: 'I understand, force rollback',
                      style: 'destructive',
                      onPress: () => onRollback(entry, true),
                    },
                  ],
                );
              } else if (status === 503 && detail?.message) {
                Alert.alert('Host daemon required', detail.message);
              } else if (status === 409) {
                Alert.alert('Already rolling back', 'Another rollback is in progress.');
              } else if (status === 410) {
                Alert.alert(
                  'Image gone',
                  detail?.message || 'The target image is no longer on the host (maybe pruned). Rebuild the release first.',
                );
              } else {
                Alert.alert('Rollback failed', typeof detail === 'string' ? detail : e?.message ?? 'unknown');
              }
            } finally {
              setBusyTag(null);
            }
          },
        },
      ],
    );
  };

  return (
    <View style={styles.flex}>
      <View style={styles.header}>
        <Pressable onPress={onClose} style={styles.back} hitSlop={10}>
          <Text style={styles.backText}>‹ Back</Text>
        </Pressable>
        <Text style={styles.title}>Versions</Text>
        <View style={{ width: 60 }} />
      </View>

      <ScrollView
        contentContainerStyle={styles.scroll}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            tintColor={colors.textMuted}
            onRefresh={() => {
              setRefreshing(true);
              load();
            }}
          />
        }
      >
        {loading && !current ? (
          <View style={styles.center}>
            <ActivityIndicator color={colors.action.primary} />
          </View>
        ) : (
          <>
            {error && (
              <View style={styles.errorBox}>
                <Text style={styles.errorIcon}>!</Text>
                <Text style={styles.errorText}>{error}</Text>
              </View>
            )}

            {current && (
              <View style={styles.currentBox}>
                <Text style={styles.currentLabel}>● RUNNING NOW</Text>
                <Text style={styles.bigTag} numberOfLines={1}>
                  {current.image_tag === 'latest' ? '(untagged build)' : current.image_tag}
                </Text>
                <View style={styles.metaRow}>
                  <Text style={styles.meta}>git {current.git_sha.slice(0, 10)}</Text>
                  <Text style={styles.meta}>{fmtBuildTs(current.build_ts)}</Text>
                </View>
                <Text style={styles.meta}>schema head: {current.alembic_head.slice(0, 10)}</Text>
              </View>
            )}

            {releases.length === 0 ? (
              <View style={styles.emptyBox}>
                <Text style={styles.emptyTitle}>No tagged releases yet</Text>
                <Text style={styles.emptyBody}>
                  Run scripts/build-tagged-release.sh on the deploy host. Each tagged build
                  becomes a rollback target here automatically.
                </Text>
              </View>
            ) : (
              <>
                <Text style={styles.sectionLabel}>Rollback targets</Text>
                {releases.map((r) => (
                  <View
                    key={r.image_tag}
                    style={[styles.releaseCard, r.is_current && styles.releaseCardCurrent]}
                  >
                    <View style={styles.releaseHeader}>
                      <Text style={styles.releaseTag} numberOfLines={1}>
                        {r.image_tag}
                      </Text>
                      {r.is_current && <Text style={styles.currentBadge}>● ACTIVE</Text>}
                    </View>
                    <View style={styles.releaseMeta}>
                      <Text style={styles.meta}>git {r.git_sha.slice(0, 7)}</Text>
                      <Text style={styles.meta}>built {fmtBuildTs(r.build_ts)}</Text>
                    </View>
                    {r.deployed_by && (
                      <Text style={styles.meta}>
                        deployed by {r.deployed_by} on {r.host}
                      </Text>
                    )}
                    {!r.image_present && (
                      <Text style={styles.warn}>⚠ image no longer on host (rebuild needed)</Text>
                    )}
                    {!r.is_current && r.image_present && (
                      <Pressable
                        style={({ pressed }) => [
                          styles.rollbackBtn,
                          (busyTag === r.image_tag || pressed) && styles.rollbackBtnBusy,
                        ]}
                        onPress={() => onRollback(r)}
                        disabled={!!busyTag}
                      >
                        {busyTag === r.image_tag ? (
                          <ActivityIndicator color={colors.action.dangerText} size="small" />
                        ) : (
                          <Text style={styles.rollbackBtnText}>Roll back to this version</Text>
                        )}
                      </Pressable>
                    )}
                  </View>
                ))}
              </>
            )}

            <Text style={styles.helperNote}>
              Code rollback is database-safe — no tickets or bookings change. Only the application
              code reverts. If the older code expected a different schema, you'll see a "schema
              mismatch" warning before anything happens.
            </Text>
          </>
        )}
      </ScrollView>
    </View>
  );
}

function fmtBuildTs(ts: string | undefined): string {
  if (!ts || ts === 'unknown') return 'unknown';
  const m = ts.match(/^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})/);
  if (m) return `${m[1]}-${m[2]}-${m[3]} ${m[4]}:${m[5]} UTC`;
  return ts;
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
  scroll: { padding: spacing.lg, paddingBottom: 40 },
  center: { paddingTop: 60, alignItems: 'center' },
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
  currentBox: {
    backgroundColor: colors.bgElev,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.md,
    borderRadius: radii.lg,
    marginBottom: spacing.lg,
    borderLeftWidth: 4,
    borderLeftColor: colors.action.primary,
  },
  currentLabel: {
    color: colors.action.primary,
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 1.2,
    marginBottom: 6,
  },
  bigTag: { color: colors.text, fontSize: 14, fontFamily: 'monospace', fontWeight: '700' },
  metaRow: { flexDirection: 'row', gap: spacing.md, marginTop: 6 },
  meta: { color: colors.textMuted, fontSize: 11 },
  sectionLabel: {
    ...t.section,
    marginBottom: spacing.sm,
  },
  emptyBox: {
    backgroundColor: colors.bgElev,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.md,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  emptyTitle: { color: colors.textMuted, fontSize: 14, fontWeight: '700' },
  emptyBody: { color: colors.textDim, fontSize: 12, marginTop: 6, lineHeight: 16 },
  releaseCard: {
    backgroundColor: colors.bgElev,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.md,
    borderRadius: radii.md,
    marginBottom: spacing.sm,
    borderWidth: 1,
    borderColor: colors.border,
  },
  releaseCardCurrent: {
    borderColor: colors.ok,
    backgroundColor: colors.okBg,
  },
  releaseHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  releaseTag: { color: colors.text, fontSize: 12, fontFamily: 'monospace', flex: 1 },
  currentBadge: { color: colors.ok, fontSize: 11, fontWeight: '800', letterSpacing: 0.5 },
  releaseMeta: { flexDirection: 'row', gap: spacing.md, marginTop: 6 },
  warn: { color: colors.warnText, fontSize: 11, marginTop: 6 },
  rollbackBtn: {
    backgroundColor: colors.action.danger,
    borderWidth: 1,
    borderColor: colors.action.dangerBorder,
    paddingVertical: 8,
    borderRadius: radii.md,
    alignItems: 'center',
    marginTop: 10,
  },
  rollbackBtnBusy: { opacity: 0.7 },
  rollbackBtnText: { color: colors.action.dangerText, fontSize: 12, fontWeight: '700' },
  helperNote: {
    color: colors.textDim,
    fontSize: 12,
    marginTop: spacing.lg,
    lineHeight: 16,
    fontStyle: 'italic',
  },
});
