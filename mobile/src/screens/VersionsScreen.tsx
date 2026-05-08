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
        <Pressable onPress={onClose} style={styles.back}>
          <Text style={styles.backText}>← back</Text>
        </Pressable>
        <Text style={styles.title}>Versions</Text>
        <View style={{ width: 60 }} />
      </View>

      <ScrollView
        contentContainerStyle={styles.scroll}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            tintColor="#cbd5e1"
            onRefresh={() => {
              setRefreshing(true);
              load();
            }}
          />
        }
      >
        {loading && !current ? (
          <View style={styles.center}>
            <ActivityIndicator color="#3b82f6" />
          </View>
        ) : (
          <>
            {error && <Text style={styles.error}>{error}</Text>}

            {current && (
              <View style={styles.currentBox}>
                <Text style={styles.label}>RUNNING NOW</Text>
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
                <Text style={styles.sectionLabel}>ROLLBACK TARGETS</Text>
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
                        style={[styles.rollbackBtn, busyTag === r.image_tag && styles.rollbackBtnBusy]}
                        onPress={() => onRollback(r)}
                        disabled={!!busyTag}
                      >
                        {busyTag === r.image_tag ? (
                          <ActivityIndicator color="#fecaca" size="small" />
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
  // Format like 20260509T020700Z
  const m = ts.match(/^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})/);
  if (m) return `${m[1]}-${m[2]}-${m[3]} ${m[4]}:${m[5]} UTC`;
  return ts;
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
  scroll: { padding: 16, paddingBottom: 40 },
  center: { paddingTop: 60, alignItems: 'center' },
  error: {
    color: '#ef4444',
    backgroundColor: '#7f1d1d20',
    padding: 10,
    borderRadius: 8,
    marginBottom: 12,
    fontSize: 13,
  },
  currentBox: {
    backgroundColor: '#1e3a8a',
    padding: 14,
    borderRadius: 12,
    marginBottom: 18,
    borderWidth: 1,
    borderColor: '#1d4ed8',
  },
  label: { color: '#dbeafe', fontSize: 11, fontWeight: '600', letterSpacing: 0.8, marginBottom: 6 },
  bigTag: { color: '#f8fafc', fontSize: 14, fontFamily: 'monospace', fontWeight: '600' },
  metaRow: { flexDirection: 'row', gap: 12, marginTop: 6 },
  meta: { color: '#cbd5e1', fontSize: 11 },
  sectionLabel: {
    color: '#cbd5e1',
    fontSize: 12,
    fontWeight: '600',
    letterSpacing: 0.8,
    marginBottom: 8,
  },
  emptyBox: {
    backgroundColor: '#1e293b',
    padding: 14,
    borderRadius: 10,
  },
  emptyTitle: { color: '#cbd5e1', fontSize: 14, fontWeight: '600' },
  emptyBody: { color: '#94a3b8', fontSize: 12, marginTop: 6, lineHeight: 16 },
  releaseCard: {
    backgroundColor: '#1e293b',
    padding: 12,
    borderRadius: 10,
    marginBottom: 10,
  },
  releaseCardCurrent: {
    borderWidth: 1,
    borderColor: '#34d399',
    backgroundColor: '#064e3b30',
  },
  releaseHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  releaseTag: { color: '#e2e8f0', fontSize: 12, fontFamily: 'monospace', flex: 1 },
  currentBadge: { color: '#34d399', fontSize: 11, fontWeight: '700', letterSpacing: 0.5 },
  releaseMeta: { flexDirection: 'row', gap: 12, marginTop: 6 },
  warn: { color: '#fbbf24', fontSize: 11, marginTop: 6 },
  rollbackBtn: {
    backgroundColor: '#3f1d1d',
    borderWidth: 1,
    borderColor: '#7f1d1d',
    paddingVertical: 8,
    borderRadius: 8,
    alignItems: 'center',
    marginTop: 10,
  },
  rollbackBtnBusy: { opacity: 0.7 },
  rollbackBtnText: { color: '#fecaca', fontSize: 12, fontWeight: '600' },
  helperNote: {
    color: '#94a3b8',
    fontSize: 12,
    marginTop: 16,
    lineHeight: 16,
    fontStyle: 'italic',
  },
});
