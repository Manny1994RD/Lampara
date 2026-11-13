import { router, useLocalSearchParams } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useState } from 'react';
import { Alert, Platform, StyleSheet, TextInput, View } from 'react-native';

import { VerseListItem } from '@/components/verse-list-item';
import { Button, ColorSwatches, Empty, IconButton, Row, Screen, Sheet, Txt } from '@/components/ui';
import type { HighlightColor } from '@/constants/theme';
import { useLive } from '@/hooks/use-live';
import { useTheme } from '@/hooks/use-theme';
import { useTranslations } from '@/hooks/use-translation';
import { useT } from '@/i18n';
import { deleteTopic, getTopicVerses, getTopics, getVerseTexts, refKey, renameTopic, setVerseInTopic } from '@/lib/data';

export default function TopicScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const db = useSQLiteContext();
  const t = useTheme();
  const { current, lang } = useTranslations();
  const { t: tr } = useT();
  const topic = useLive(async (d) => (await getTopics(d)).find((x) => x.id === id) ?? null, [id], ['topics']);
  const verses = useLive(
    async (d) => {
      const rows = await getTopicVerses(d, id);
      const texts = await getVerseTexts(d, current?.id ?? null, rows);
      return rows.map((r) => ({ ...r, text: texts.get(refKey(r)) ?? '' }));
    },
    [id, current?.id],
    ['topics', 'translations']
  );
  const [edit, setEdit] = useState(false);
  const [name, setName] = useState('');
  const [color, setColor] = useState<HighlightColor>('blue');

  const back = () => (router.canGoBack() ? router.back() : router.navigate('/library'));

  const remove = async () => {
    const msg = tr('topic.deleteBody');
    const ok =
      Platform.OS === 'web'
        ? window.confirm(msg)
        : await new Promise<boolean>((r) =>
            Alert.alert(tr('topic.deleteTitle'), msg, [
              { text: tr('common.cancel'), style: 'cancel', onPress: () => r(false) },
              { text: tr('common.delete'), style: 'destructive', onPress: () => r(true) },
            ])
          );
    if (ok) {
      await deleteTopic(db, id);
      back();
    }
  };

  return (
    <Screen>
      <Row>
        <IconButton icon="chevron-back" label={tr('common.back')} onPress={back} />
        <Txt variant="title" style={{ flex: 1 }} numberOfLines={2}>
          {topic?.name ?? ''}
        </Txt>
        <IconButton
          icon="create-outline"
          label={tr('topic.edit')}
          onPress={() => {
            if (!topic) return;
            setName(topic.name);
            setColor(topic.color);
            setEdit(true);
          }}
        />
        <IconButton icon="trash-outline" label={tr('common.delete')} color={t.danger} onPress={remove} />
      </Row>
      <View style={{ gap: 10, marginTop: 12 }}>
        {verses && verses.length === 0 ? (
          <Empty
            icon="pricetag-outline"
            title={tr('topic.empty')}
            body={tr('topic.emptyHint')}
          />
        ) : (
          verses?.map((v) => (
            <VerseListItem
              key={refKey(v)}
              book={v.book}
              ch={v.ch}
              v={v.v}
              text={v.text}
              lang={lang}
              color={topic?.color}
              right={<IconButton icon="close" size={18} label={tr('topic.removeVerse')} onPress={() => setVerseInTopic(db, id, [v], false)} />}
            />
          ))
        )}
      </View>

      <Sheet visible={edit} onClose={() => setEdit(false)} title={tr('topic.edit')}>
        <TextInput
          value={name}
          onChangeText={setName}
          style={[styles.input, { color: t.text, borderColor: t.border, backgroundColor: t.cardAlt }]}
        />
        <View style={{ marginVertical: 14 }}>
          <ColorSwatches value={color} onChange={(c) => c && setColor(c)} />
        </View>
        <Button
          title={tr('common.save')}
          disabled={!name.trim()}
          onPress={async () => {
            await renameTopic(db, id, name, color);
            setEdit(false);
          }}
        />
      </Sheet>
    </Screen>
  );
}

const styles = StyleSheet.create({
  input: { borderWidth: 1, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10, fontSize: 16 },
});
