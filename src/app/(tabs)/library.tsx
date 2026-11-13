import { router } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useState } from 'react';
import { Pressable, StyleSheet, TextInput, View } from 'react-native';

import { VerseListItem } from '@/components/verse-list-item';
import { Button, Card, Chip, ColorSwatches, Empty, IconButton, Row, Screen, Sheet, Txt, highlightBg } from '@/components/ui';
import { HIGHLIGHT_KEYS, type HighlightColor } from '@/constants/theme';
import { useLive } from '@/hooks/use-live';
import { useTheme } from '@/hooks/use-theme';
import { useTranslations } from '@/hooks/use-translation';
import { useT } from '@/i18n';
import {
  createTopic,
  deleteHighlight,
  getAllBookmarks,
  getAllHighlights,
  getAllNotes,
  getTopics,
  getVerseTexts,
  refKey,
  toggleBookmark,
} from '@/lib/data';

type Tab = 'highlights' | 'bookmarks' | 'notes' | 'topics';

export default function LibraryScreen() {
  const db = useSQLiteContext();
  const t = useTheme();
  const { current, lang } = useTranslations();
  const { t: L, tn } = useT();
  const tr = current?.id ?? null;
  const [tab, setTab] = useState<Tab>('highlights');
  const [colorFilter, setColorFilter] = useState<HighlightColor | null>(null);
  const [newTopic, setNewTopic] = useState(false);
  const [topicName, setTopicName] = useState('');
  const [topicColor, setTopicColor] = useState<HighlightColor>('blue');

  const highlights = useLive(
    async (d) => {
      const rows = await getAllHighlights(d);
      const texts = await getVerseTexts(d, tr, rows);
      return rows.map((h) => {
        const full = texts.get(refKey(h)) ?? '';
        // For word highlights in the current translation, show just the highlighted words.
        const words = h.start != null && h.tr === tr ? full.slice(h.start, h.end ?? undefined) : null;
        return { ...h, text: full, words };
      });
    },
    [tr],
    ['highlights', 'translations']
  );
  const bookmarks = useLive(
    async (d) => {
      const rows = await getAllBookmarks(d);
      const texts = await getVerseTexts(d, tr, rows);
      return rows.map((r) => ({ ...r, text: texts.get(refKey(r)) ?? '' }));
    },
    [tr],
    ['bookmarks', 'translations']
  );
  const notes = useLive(
    async (d) => {
      const rows = await getAllNotes(d);
      const texts = await getVerseTexts(d, tr, rows);
      return rows.map((r) => ({ ...r, text: texts.get(refKey(r)) ?? '' }));
    },
    [tr],
    ['notes', 'translations']
  );
  const topics = useLive((d) => getTopics(d), [], ['topics']);

  const tabs: { key: Tab; label: string; count?: number }[] = [
    { key: 'highlights', label: L('library.highlights'), count: highlights?.length },
    { key: 'bookmarks', label: L('library.bookmarks'), count: bookmarks?.length },
    { key: 'notes', label: L('library.notes'), count: notes?.length },
    { key: 'topics', label: L('library.topics'), count: topics?.length },
  ];

  const shownHighlights = (highlights ?? []).filter((h) => !colorFilter || h.color === colorFilter);

  return (
    <Screen>
      <Txt variant="title">{L('library.title')}</Txt>
      <Row style={{ flexWrap: 'wrap', marginTop: 12, marginBottom: 16 }}>
        {tabs.map((x) => (
          <Chip key={x.key} label={`${x.label}${x.count ? ` · ${x.count}` : ''}`} selected={tab === x.key} onPress={() => setTab(x.key)} />
        ))}
      </Row>

      {tab === 'highlights' && (
        <View style={{ gap: 10 }}>
          <Row style={{ flexWrap: 'wrap' }} gap={8}>
            <Chip label={L('common.all')} selected={!colorFilter} onPress={() => setColorFilter(null)} />
            {HIGHLIGHT_KEYS.map((c) => (
              <Pressable
                key={c}
                accessibilityLabel={`Show ${c}`}
                onPress={() => setColorFilter(colorFilter === c ? null : c)}
                style={[styles.filterDot, { backgroundColor: highlightBg(c, t.dark), borderColor: colorFilter === c ? t.text : 'transparent' }]}
              />
            ))}
          </Row>
          {shownHighlights.length === 0 ? (
            <Empty icon="color-palette-outline" title={L('library.noHighlights')} body={L('library.noHighlightsHint')} />
          ) : (
            shownHighlights.map((h) => (
              <VerseListItem
                key={h.id}
                book={h.book}
                ch={h.ch}
                v={h.v}
                lang={lang}
                color={h.color}
                text={h.words ? `“${h.words}”` : h.text}
                extra={
                  h.words ? (
                    <Txt variant="caption" muted>
                      {L('library.wordsHighlighted')}
                    </Txt>
                  ) : null
                }
                right={<IconButton icon="trash-outline" size={18} label={L('library.deleteHighlight')} onPress={() => deleteHighlight(db, h.id)} />}
              />
            ))
          )}
        </View>
      )}

      {tab === 'bookmarks' && (
        <View style={{ gap: 10 }}>
          {!bookmarks?.length ? (
            <Empty icon="bookmark-outline" title={L('library.noBookmarks')} />
          ) : (
            bookmarks.map((b) => (
              <VerseListItem
                key={b.id}
                book={b.book}
                ch={b.ch}
                v={b.v}
                lang={lang}
                text={b.text}
                right={<IconButton icon="bookmark" size={18} label={L('library.removeBookmark')} onPress={() => toggleBookmark(db, b)} />}
              />
            ))
          )}
        </View>
      )}

      {tab === 'notes' && (
        <View style={{ gap: 10 }}>
          {!notes?.length ? (
            <Empty icon="create-outline" title={L('library.noNotes')} />
          ) : (
            notes.map((n) => (
              <VerseListItem
                key={n.id}
                book={n.book}
                ch={n.ch}
                v={n.v}
                lang={lang}
                text={n.text}
                extra={
                  <View style={[styles.note, { backgroundColor: t.cardAlt }]}>
                    <Txt variant="small">{n.body}</Txt>
                  </View>
                }
              />
            ))
          )}
        </View>
      )}

      {tab === 'topics' && (
        <View style={{ gap: 10 }}>
          <Button title={L('topics.new')} icon="add" kind="secondary" onPress={() => setNewTopic(true)} style={{ alignSelf: 'flex-start' }} />
          {!topics?.length ? (
            <Empty
              icon="pricetags-outline"
              title={L('library.noTopics')}
              body={L('library.noTopicsHint')}
            />
          ) : (
            <View style={styles.topicGrid}>
              {topics.map((tp) => (
                <Card key={tp.id} style={[styles.topicCard, { borderLeftColor: highlightBg(tp.color, !t.dark) }]} onPress={() => router.push({ pathname: '/topic/[id]', params: { id: tp.id } })}>
                  <Txt variant="label" numberOfLines={2}>
                    {tp.name}
                  </Txt>
                  <Txt variant="small" muted>
                    {tn('common.verses', tp.count)}
                  </Txt>
                </Card>
              ))}
            </View>
          )}
        </View>
      )}

      <Sheet visible={newTopic} onClose={() => setNewTopic(false)} title={L('topics.new')}>
        <TextInput
          value={topicName}
          onChangeText={setTopicName}
          autoFocus
          placeholder={L('topics.name')}
          placeholderTextColor={t.textSecondary}
          style={[styles.input, { color: t.text, borderColor: t.border, backgroundColor: t.cardAlt }]}
        />
        <View style={{ marginVertical: 14 }}>
          <ColorSwatches value={topicColor} onChange={(c) => c && setTopicColor(c)} />
        </View>
        <Button
          title={L('common.create')}
          disabled={!topicName.trim()}
          onPress={async () => {
            await createTopic(db, topicName, topicColor);
            setTopicName('');
            setNewTopic(false);
          }}
        />
      </Sheet>
    </Screen>
  );
}

const styles = StyleSheet.create({
  filterDot: { width: 30, height: 30, borderRadius: 15, borderWidth: 2 },
  note: { borderRadius: 10, padding: 10, marginTop: 4 },
  topicGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  topicCard: { flexBasis: '45%', flexGrow: 1, gap: 4, borderLeftWidth: 6, minHeight: 84 },
  input: { borderWidth: 1, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10, fontSize: 16 },
});
