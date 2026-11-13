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
import { deleteTopic, getTopicVerses, getTopics, getVerseTexts, refKey, renameTopic, setVerseInTopic } from '@/lib/data';

export default function TopicScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const db = useSQLiteContext();
  const t = useTheme();
  const { current, lang } = useTranslations();
  const es = lang === 'es';
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
    const msg = es ? 'Los versículos no se borran, solo el tema.' : 'The verses themselves are not deleted, only the topic.';
    const ok =
      Platform.OS === 'web'
        ? window.confirm(msg)
        : await new Promise<boolean>((r) =>
            Alert.alert(es ? '¿Borrar tema?' : 'Delete topic?', msg, [
              { text: 'Cancel', style: 'cancel', onPress: () => r(false) },
              { text: 'Delete', style: 'destructive', onPress: () => r(true) },
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
        <IconButton icon="chevron-back" label="Back" onPress={back} />
        <Txt variant="title" style={{ flex: 1 }} numberOfLines={2}>
          {topic?.name ?? ''}
        </Txt>
        <IconButton
          icon="create-outline"
          label="Edit topic"
          onPress={() => {
            if (!topic) return;
            setName(topic.name);
            setColor(topic.color);
            setEdit(true);
          }}
        />
        <IconButton icon="trash-outline" label="Delete topic" color={t.danger} onPress={remove} />
      </Row>
      <View style={{ gap: 10, marginTop: 12 }}>
        {verses && verses.length === 0 ? (
          <Empty
            icon="pricetag-outline"
            title={es ? 'Este tema está vacío' : 'This topic is empty'}
            body={es ? 'En el lector, toca un versículo → Tema.' : 'In the reader, tap a verse → Topic.'}
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
              right={<IconButton icon="close" size={18} label="Remove from topic" onPress={() => setVerseInTopic(db, id, [v], false)} />}
            />
          ))
        )}
      </View>

      <Sheet visible={edit} onClose={() => setEdit(false)} title={es ? 'Editar tema' : 'Edit topic'}>
        <TextInput
          value={name}
          onChangeText={setName}
          style={[styles.input, { color: t.text, borderColor: t.border, backgroundColor: t.cardAlt }]}
        />
        <View style={{ marginVertical: 14 }}>
          <ColorSwatches value={color} onChange={(c) => c && setColor(c)} />
        </View>
        <Button
          title={es ? 'Guardar' : 'Save'}
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
