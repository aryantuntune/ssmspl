/**
 * Todos screen — the project follow-up list.
 *
 * Use case: while debugging one thing, the operator captures "remember to
 * fix X / add Y" as a todo. This screen lists them all so they actually get
 * remembered between sessions.  Hits `/api/todos` on the Admin server
 * regardless of which server is "active" in the multi-server switcher.
 */
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import {
  createTodo,
  deleteTodo,
  listTodos,
  updateTodo,
  type Todo,
  type TodoPriority,
  type TodoStatus,
} from '../api/todos';
import { colors, radii, spacing, text as t } from '../theme';

type FilterStatus = 'active' | 'all' | 'done';

const FILTERS: Array<{ id: FilterStatus; label: string }> = [
  { id: 'active', label: 'Active' },
  { id: 'all', label: 'All' },
  { id: 'done', label: 'Done' },
];

const PRIORITY_ORDER: Record<TodoPriority, number> = { high: 3, medium: 2, low: 1 };
const STATUS_LABEL: Record<TodoStatus, string> = {
  open: 'OPEN',
  in_progress: 'IN PROGRESS',
  done: 'DONE',
  wont_do: "WON'T DO",
};

export default function TodosScreen({ onClose }: { onClose: () => void }) {
  const [filter, setFilter] = useState<FilterStatus>('active');
  const [items, setItems] = useState<Todo[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState<Todo | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const params =
        filter === 'active'
          ? { status: ['open', 'in_progress'] as TodoStatus[] }
          : filter === 'done'
            ? { status: ['done', 'wont_do'] as TodoStatus[] }
            : {};
      const r = await listTodos({ ...params, limit: 100 });
      setItems(r.items);
    } catch (err: any) {
      const detail = err?.response?.data?.detail ?? err?.message ?? 'Failed to load';
      setError(typeof detail === 'string' ? detail : 'Failed to load');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [filter]);

  useEffect(() => {
    setLoading(true);
    load();
  }, [load]);

  const sorted = useMemo(() => {
    return [...items].sort((a, b) => {
      // Active (open + in_progress) before done/wont_do
      const aActive = a.status === 'open' || a.status === 'in_progress';
      const bActive = b.status === 'open' || b.status === 'in_progress';
      if (aActive !== bActive) return aActive ? -1 : 1;
      const dp = PRIORITY_ORDER[b.priority] - PRIORITY_ORDER[a.priority];
      if (dp !== 0) return dp;
      return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
    });
  }, [items]);

  const counts = useMemo(() => {
    return items.reduce(
      (acc, x) => {
        if (x.status === 'open' || x.status === 'in_progress') acc.active++;
        if (x.status === 'done' || x.status === 'wont_do') acc.done++;
        if ((x.status === 'open' || x.status === 'in_progress') && x.priority === 'high') {
          acc.highOpen++;
        }
        return acc;
      },
      { active: 0, done: 0, highOpen: 0 },
    );
  }, [items]);

  const onComplete = async (todo: Todo) => {
    const newStatus: TodoStatus = todo.status === 'done' ? 'open' : 'done';
    try {
      const updated = await updateTodo(todo.id, { status: newStatus });
      setItems((cur) => cur.map((x) => (x.id === updated.id ? updated : x)));
    } catch (err: any) {
      Alert.alert('Update failed', err?.response?.data?.detail ?? err?.message ?? String(err));
    }
  };

  const onDelete = (todo: Todo) => {
    Alert.alert(
      'Delete todo?',
      `"${todo.title}" — this is a hard delete, the row is gone forever.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              await deleteTodo(todo.id);
              setItems((cur) => cur.filter((x) => x.id !== todo.id));
            } catch (err: any) {
              Alert.alert('Delete failed', err?.response?.data?.detail ?? err?.message ?? String(err));
            }
          },
        },
      ],
    );
  };

  return (
    <View style={styles.flex}>
      <View style={styles.headerRow}>
        <Pressable onPress={onClose} hitSlop={10}>
          <Text style={styles.backBtn}>‹ Back</Text>
        </Pressable>
        <Text style={styles.h1}>Todos</Text>
        <Pressable onPress={() => setAdding(true)} hitSlop={10}>
          <Text style={styles.addBtn}>+ Add</Text>
        </Pressable>
      </View>

      <View style={styles.statsRow}>
        <Stat label="Active" value={counts.active} />
        <Stat label="High prio open" value={counts.highOpen} accent={counts.highOpen > 0 ? colors.crit : undefined} />
        <Stat label="Done / wontdo" value={counts.done} muted />
      </View>

      <View style={styles.filterRow}>
        {FILTERS.map((f) => (
          <Pressable
            key={f.id}
            onPress={() => setFilter(f.id)}
            style={[styles.filterChip, filter === f.id && styles.filterChipActive]}
          >
            <Text style={[styles.filterChipText, filter === f.id && styles.filterChipTextActive]}>{f.label}</Text>
          </Pressable>
        ))}
      </View>

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator color={colors.action.primary} />
        </View>
      ) : (
        <ScrollView
          style={styles.flex}
          contentContainerStyle={styles.list}
          refreshControl={
            <RefreshControl
              tintColor={colors.action.primary}
              refreshing={refreshing}
              onRefresh={() => {
                setRefreshing(true);
                load();
              }}
            />
          }
        >
          {error && (
            <View style={styles.errorBox}>
              <Text style={styles.errorText}>{error}</Text>
            </View>
          )}
          {!error && sorted.length === 0 && (
            <View style={styles.emptyBox}>
              <Text style={styles.emptyTitle}>Nothing here</Text>
              <Text style={styles.emptyDim}>
                {filter === 'active'
                  ? 'No active todos. Tap + Add to capture something.'
                  : filter === 'done'
                    ? 'No completed todos yet.'
                    : 'List is empty.'}
              </Text>
            </View>
          )}
          {sorted.map((todo) => (
            <TodoCard
              key={todo.id}
              todo={todo}
              onToggleComplete={() => onComplete(todo)}
              onEdit={() => setEditing(todo)}
              onDelete={() => onDelete(todo)}
            />
          ))}
        </ScrollView>
      )}

      <TodoEditModal
        visible={adding}
        initial={null}
        onClose={() => setAdding(false)}
        onSaved={(t) => {
          setItems((cur) => [t, ...cur]);
          setAdding(false);
        }}
      />
      <TodoEditModal
        visible={editing != null}
        initial={editing}
        onClose={() => setEditing(null)}
        onSaved={(t) => {
          setItems((cur) => cur.map((x) => (x.id === t.id ? t : x)));
          setEditing(null);
        }}
      />
    </View>
  );
}

// ---- Stat tile -----------------------------------------------------------

function Stat({ label, value, accent, muted }: { label: string; value: number; accent?: string; muted?: boolean }) {
  return (
    <View style={styles.statTile}>
      <Text style={[styles.statValue, accent ? { color: accent } : muted ? { color: colors.textMuted } : null]}>
        {value}
      </Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

// ---- Todo card -----------------------------------------------------------

function TodoCard({
  todo,
  onToggleComplete,
  onEdit,
  onDelete,
}: {
  todo: Todo;
  onToggleComplete: () => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const isDone = todo.status === 'done' || todo.status === 'wont_do';
  const accent =
    todo.priority === 'high' ? colors.crit : todo.priority === 'medium' ? colors.warn : colors.textDim;

  return (
    <View style={[styles.card, isDone && { opacity: 0.55 }]}>
      <View style={[styles.priRail, { backgroundColor: accent }]} />
      <View style={styles.cardBody}>
        <View style={styles.cardTopRow}>
          <Pressable onPress={onToggleComplete} hitSlop={10}>
            <View style={[styles.checkbox, isDone && styles.checkboxChecked]}>
              {isDone && <Text style={styles.checkmark}>✓</Text>}
            </View>
          </Pressable>
          <Pressable style={styles.cardTitleArea} onPress={onEdit}>
            <Text
              style={[styles.cardTitle, isDone && { textDecorationLine: 'line-through' }]}
              numberOfLines={2}
            >
              {todo.title}
            </Text>
            {!!todo.description && (
              <Text style={styles.cardDesc} numberOfLines={2}>
                {todo.description}
              </Text>
            )}
          </Pressable>
        </View>

        <View style={styles.cardMetaRow}>
          <View style={[styles.priChip, { borderColor: accent }]}>
            <Text style={[styles.priChipText, { color: accent }]}>{todo.priority.toUpperCase()}</Text>
          </View>
          <View style={styles.statusChip}>
            <Text style={styles.statusChipText}>{STATUS_LABEL[todo.status]}</Text>
          </View>
          {todo.tags.slice(0, 4).map((tag) => (
            <View key={tag} style={styles.tagChip}>
              <Text style={styles.tagChipText}>#{tag}</Text>
            </View>
          ))}
          {todo.tags.length > 4 && <Text style={styles.tagMore}>+{todo.tags.length - 4}</Text>}
        </View>

        {!!todo.notes && (
          <Text style={styles.notesText} numberOfLines={3}>
            {todo.notes}
          </Text>
        )}

        <View style={styles.cardActions}>
          <Pressable onPress={onEdit} style={({ pressed }) => [styles.miniBtn, pressed && { opacity: 0.6 }]}>
            <Text style={styles.miniBtnText}>Edit</Text>
          </Pressable>
          <Pressable onPress={onDelete} style={({ pressed }) => [styles.miniBtn, styles.miniBtnDanger, pressed && { opacity: 0.6 }]}>
            <Text style={[styles.miniBtnText, { color: colors.action.dangerText }]}>Delete</Text>
          </Pressable>
        </View>
      </View>
    </View>
  );
}

// ---- Edit / Add modal ---------------------------------------------------

function TodoEditModal({
  visible,
  initial,
  onClose,
  onSaved,
}: {
  visible: boolean;
  initial: Todo | null;
  onClose: () => void;
  onSaved: (t: Todo) => void;
}) {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [priority, setPriority] = useState<TodoPriority>('medium');
  const [status, setStatus] = useState<TodoStatus>('open');
  const [tagInput, setTagInput] = useState('');
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (visible) {
      setTitle(initial?.title ?? '');
      setDescription(initial?.description ?? '');
      setPriority(initial?.priority ?? 'medium');
      setStatus(initial?.status ?? 'open');
      setTagInput((initial?.tags ?? []).join(', '));
      setNotes(initial?.notes ?? '');
    }
  }, [visible, initial]);

  const save = async () => {
    if (!title.trim()) {
      Alert.alert('Title required', 'Give the todo a one-line title.');
      return;
    }
    setSaving(true);
    try {
      const tags = tagInput
        .split(',')
        .map((s) => s.trim().toLowerCase())
        .filter((s) => s.length > 0 && s.length <= 40);
      const payload = {
        title: title.trim().slice(0, 200),
        description: description.trim() || null,
        priority,
        tags,
      };
      let saved: Todo;
      if (initial) {
        saved = await updateTodo(initial.id, { ...payload, status, notes: notes.trim() || null });
      } else {
        saved = await createTodo(payload);
      }
      onSaved(saved);
    } catch (err: any) {
      Alert.alert('Save failed', err?.response?.data?.detail ?? err?.message ?? String(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.modalBackdrop}
      >
        <View style={styles.modalCard}>
          <View style={styles.modalHeader}>
            <Pressable onPress={onClose} hitSlop={10}>
              <Text style={styles.backBtn}>Cancel</Text>
            </Pressable>
            <Text style={styles.h2}>{initial ? 'Edit todo' : 'New todo'}</Text>
            <Pressable onPress={save} hitSlop={10} disabled={saving}>
              <Text style={[styles.addBtn, saving && { opacity: 0.5 }]}>{saving ? 'Saving…' : 'Save'}</Text>
            </Pressable>
          </View>

          <ScrollView contentContainerStyle={styles.modalScroll} keyboardShouldPersistTaps="handled">
            <Text style={styles.fieldLabel}>Title</Text>
            <TextInput
              style={styles.input}
              value={title}
              onChangeText={setTitle}
              placeholder="What needs doing?"
              placeholderTextColor={colors.textFaint}
              maxLength={200}
            />

            <Text style={styles.fieldLabel}>Description (optional)</Text>
            <TextInput
              style={[styles.input, styles.inputMulti]}
              value={description}
              onChangeText={setDescription}
              placeholder="Context, reproduction, link, etc."
              placeholderTextColor={colors.textFaint}
              multiline
              numberOfLines={3}
            />

            <Text style={styles.fieldLabel}>Priority</Text>
            <View style={styles.segmentRow}>
              {(['low', 'medium', 'high'] as TodoPriority[]).map((p) => (
                <Pressable
                  key={p}
                  onPress={() => setPriority(p)}
                  style={[
                    styles.segment,
                    priority === p && styles.segmentActive,
                    priority === p && p === 'high' && { borderColor: colors.crit },
                  ]}
                >
                  <Text style={[styles.segmentText, priority === p && styles.segmentTextActive]}>
                    {p.toUpperCase()}
                  </Text>
                </Pressable>
              ))}
            </View>

            {initial && (
              <>
                <Text style={styles.fieldLabel}>Status</Text>
                <View style={styles.segmentRow}>
                  {(['open', 'in_progress', 'done', 'wont_do'] as TodoStatus[]).map((s) => (
                    <Pressable
                      key={s}
                      onPress={() => setStatus(s)}
                      style={[styles.segment, status === s && styles.segmentActive]}
                    >
                      <Text style={[styles.segmentText, status === s && styles.segmentTextActive]}>
                        {STATUS_LABEL[s]}
                      </Text>
                    </Pressable>
                  ))}
                </View>
              </>
            )}

            <Text style={styles.fieldLabel}>Tags (comma-separated)</Text>
            <TextInput
              style={styles.input}
              value={tagInput}
              onChangeText={setTagInput}
              placeholder="mobile, prod, ui"
              placeholderTextColor={colors.textFaint}
              autoCapitalize="none"
            />

            {initial && (
              <>
                <Text style={styles.fieldLabel}>Follow-up notes</Text>
                <TextInput
                  style={[styles.input, styles.inputMulti]}
                  value={notes}
                  onChangeText={setNotes}
                  placeholder="Updates as you work on it"
                  placeholderTextColor={colors.textFaint}
                  multiline
                  numberOfLines={4}
                />
              </>
            )}
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

// ---- Styles -------------------------------------------------------------

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: colors.bg },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.bg },

  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    paddingBottom: spacing.md,
  },
  backBtn: { color: colors.action.primary, fontSize: 16, fontWeight: '600' },
  addBtn: { color: colors.action.primary, fontSize: 16, fontWeight: '700' },
  h1: { ...t.h1, fontSize: 18 },
  h2: { ...t.h2 },

  statsRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
    marginBottom: spacing.md,
  },
  statTile: {
    flex: 1,
    backgroundColor: colors.bgElev,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.md,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
  },
  statValue: { ...t.h1, fontSize: 22, color: colors.text },
  statLabel: { ...t.meta, marginTop: 2, textAlign: 'center' },

  filterRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
    marginBottom: spacing.md,
  },
  filterChip: {
    paddingHorizontal: spacing.md,
    paddingVertical: 6,
    backgroundColor: colors.bgElev,
    borderRadius: radii.pill,
    borderWidth: 1,
    borderColor: colors.border,
  },
  filterChipActive: { backgroundColor: colors.action.primary, borderColor: colors.action.primaryBorder },
  filterChipText: { fontSize: 12, fontWeight: '600', color: colors.textMuted, letterSpacing: 0.4 },
  filterChipTextActive: { color: colors.action.primaryText },

  list: { paddingHorizontal: spacing.lg, paddingBottom: 60 },

  errorBox: {
    backgroundColor: colors.critBg,
    borderColor: colors.crit,
    borderWidth: 1,
    borderRadius: radii.md,
    padding: spacing.md,
    marginBottom: spacing.md,
  },
  errorText: { ...t.body, color: colors.critText },

  emptyBox: {
    backgroundColor: colors.bgElev,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: radii.md,
    padding: spacing.xl,
    alignItems: 'center',
  },
  emptyTitle: { ...t.h2, marginBottom: 4 },
  emptyDim: { ...t.bodyMuted, textAlign: 'center' },

  card: {
    flexDirection: 'row',
    backgroundColor: colors.bgElev,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: spacing.sm,
    overflow: 'hidden',
  },
  priRail: { width: 3 },
  cardBody: { flex: 1, padding: spacing.md },
  cardTopRow: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm },
  checkbox: {
    width: 22,
    height: 22,
    borderRadius: radii.sm,
    borderWidth: 1.5,
    borderColor: colors.borderStrong,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 2,
  },
  checkboxChecked: { backgroundColor: colors.ok, borderColor: colors.ok },
  checkmark: { color: colors.bg, fontSize: 14, fontWeight: '900' },
  cardTitleArea: { flex: 1 },
  cardTitle: { ...t.h2, fontSize: 15 },
  cardDesc: { ...t.bodyMuted, marginTop: 4 },

  cardMetaRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: spacing.sm },
  priChip: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: radii.sm,
    borderWidth: 1,
  },
  priChipText: { fontSize: 10, fontWeight: '800', letterSpacing: 0.6 },
  statusChip: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: radii.sm,
    backgroundColor: colors.bgElev2,
    borderWidth: 1,
    borderColor: colors.border,
  },
  statusChipText: { fontSize: 10, fontWeight: '800', letterSpacing: 0.6, color: colors.textMuted },
  tagChip: {
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: radii.sm,
    backgroundColor: colors.bgElev2,
  },
  tagChipText: { fontSize: 11, fontWeight: '500', color: colors.textMuted },
  tagMore: { fontSize: 11, color: colors.textDim, alignSelf: 'center' },

  notesText: { ...t.bodyMuted, marginTop: spacing.sm, fontStyle: 'italic' },

  cardActions: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.md },
  miniBtn: {
    paddingHorizontal: spacing.md,
    paddingVertical: 5,
    backgroundColor: colors.bgElev2,
    borderRadius: radii.sm,
    borderWidth: 1,
    borderColor: colors.borderStrong,
  },
  miniBtnDanger: { borderColor: colors.action.dangerBorder, backgroundColor: colors.action.danger },
  miniBtnText: { color: colors.textMuted, fontSize: 11, fontWeight: '600' },

  // Modal
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.65)',
    justifyContent: 'flex-end',
  },
  modalCard: {
    backgroundColor: colors.bg,
    borderTopLeftRadius: radii.xl,
    borderTopRightRadius: radii.xl,
    maxHeight: '92%',
    paddingBottom: spacing.lg,
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: spacing.lg,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  modalScroll: { padding: spacing.lg },
  fieldLabel: { ...t.section, marginTop: spacing.md, marginBottom: spacing.xs },
  input: {
    backgroundColor: colors.bgElev2,
    color: colors.text,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.border,
    fontSize: 14,
  },
  inputMulti: { minHeight: 80, textAlignVertical: 'top' },
  segmentRow: { flexDirection: 'row', gap: 6, flexWrap: 'wrap' },
  segment: {
    paddingHorizontal: spacing.md,
    paddingVertical: 6,
    borderRadius: radii.sm,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.bgElev,
  },
  segmentActive: {
    backgroundColor: colors.action.primary,
    borderColor: colors.action.primaryBorder,
  },
  segmentText: { fontSize: 11, fontWeight: '700', color: colors.textMuted, letterSpacing: 0.4 },
  segmentTextActive: { color: colors.action.primaryText },
});
