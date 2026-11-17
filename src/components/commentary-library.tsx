import * as DocumentPicker from 'expo-document-picker';
import { useState } from 'react';
import { Alert, Platform, StyleSheet, View } from 'react-native';

import { Button, Card, IconButton, Ionicons, ProgressBar, Row, Txt, type IconName } from '@/components/ui';
import { useRemote } from '@/hooks/use-remote';
import { useTheme } from '@/hooks/use-theme';
import { LANGUAGES, getT, useT, type TKey } from '@/i18n';
import { deleteCommentary, importCommentary, listCommentaries, type CommentaryKind } from '@/lib/commentaries';
import { useHub } from '@/lib/hub';

const KIND: Record<CommentaryKind, { icon: IconName; label: TKey }> = {
  refs: { icon: 'git-branch-outline', label: 'notes.kind.refs' },
  notes: { icon: 'document-text-outline', label: 'notes.kind.notes' },
  commentary: { icon: 'library-outline', label: 'notes.kind.commentary' },
};

function confirm(title: string, msg: string): Promise<boolean> {
  if (Platform.OS === 'web') return Promise.resolve(window.confirm(`${title}\n\n${msg}`));
  return new Promise((resolve) =>
    Alert.alert(title, msg, [
      { text: getT().t('common.cancel'), style: 'cancel', onPress: () => resolve(false) },
      { text: getT().t('common.remove'), style: 'destructive', onPress: () => resolve(true) },
    ])
  );
}

/** Ajustes → Comentarios y referencias: what's in the church library; the owner imports e-Sword .cmtx files here. */
export function CommentaryLibrary() {
  const t = useTheme();
  const { t: tr, locale } = useT();
  const hub = useHub();
  const list = useRemote(() => listCommentaries(), [hub?.user.id ?? ''], ['hub']);
  const [busy, setBusy] = useState<{ file: string; pct: number } | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  if (!hub) {
    return (
      <Card>
        <Txt variant="small" muted>
          {tr('notes.signInHint')}
        </Txt>
      </Card>
    );
  }
  const items = list.data?.items ?? [];
  const canManage = !!list.data?.can_manage;

  const pick = async () => {
    setMsg(null);
    const res = await DocumentPicker.getDocumentAsync({ multiple: true, copyToCacheDirectory: true, type: '*/*' });
    if (res.canceled) return;
    const done: string[] = [];
    const failed: string[] = [];
    for (const a of res.assets) {
      setBusy({ file: a.name, pct: 0 });
      try {
        const r = await importCommentary(a, (pct) => setBusy({ file: a.name, pct }));
        done.push(r.name);
      } catch (e) {
        failed.push(e instanceof Error ? e.message : String(e));
      }
    }
    setBusy(null);
    list.reload();
    setMsg(
      failed.length
        ? { ok: false, text: [...done.map((d) => `✓ ${d}`), ...failed].join('\n') }
        : { ok: true, text: tr('notes.imported', { names: done.join(', ') }) }
    );
  };

  return (
    <Card style={{ gap: 4 }}>
      <Txt variant="small" muted style={{ marginBottom: 6 }}>
        {tr('notes.libraryHint')}
      </Txt>
      {items.length === 0 && !list.loading && (
        <Txt variant="small" muted>
          {tr('notes.none')}
        </Txt>
      )}
      {items.map((c) => (
        <Row key={c.id} style={[styles.row, { borderColor: t.border }]}>
          <Ionicons name={KIND[c.kind]?.icon ?? 'library-outline'} size={20} color={t.accent} />
          <View style={{ flex: 1 }}>
            <Txt variant="label" numberOfLines={2}>
              {c.name}
            </Txt>
            <Txt variant="caption" muted>
              {tr(KIND[c.kind]?.label ?? 'notes.kind.commentary')} ·{' '}
              {/* References are verse links, so their language doesn't matter. */}
              {c.kind === 'refs' ? '' : `${LANGUAGES.find((l) => l.code === c.lang)?.name ?? c.lang} · `}
              {tr('notes.entries', { n: c.entries.toLocaleString(locale) })}
            </Txt>
          </View>
          {canManage && (
            <IconButton
              icon="trash-outline"
              size={18}
              color={t.danger}
              label={tr('common.remove')}
              onPress={async () => {
                if (await confirm(tr('notes.removeTitle', { name: c.name }), tr('notes.removeBody'))) {
                  await deleteCommentary(c.id);
                  list.reload();
                }
              }}
            />
          )}
        </Row>
      ))}
      {busy && (
        <View style={{ gap: 6, marginTop: 8 }}>
          <Txt variant="small" muted numberOfLines={1}>
            {tr('notes.uploading', { pct: busy.pct })} · {busy.file}
          </Txt>
          <ProgressBar value={busy.pct / 100} />
        </View>
      )}
      {msg && (
        <Txt variant="small" color={msg.ok ? t.success : t.danger} style={{ marginTop: 8 }}>
          {msg.text}
        </Txt>
      )}
      {canManage && !busy && (
        <Button icon="download-outline" title={tr('notes.import')} onPress={pick} style={{ marginTop: 10 }} />
      )}
      {canManage && (
        <Txt variant="caption" muted style={{ marginTop: 6 }}>
          {tr('notes.importHint')}
        </Txt>
      )}
    </Card>
  );
}

const styles = StyleSheet.create({
  row: { paddingVertical: 10, borderBottomWidth: StyleSheet.hairlineWidth, gap: 10 },
});
