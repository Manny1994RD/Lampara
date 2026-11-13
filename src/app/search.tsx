import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { StyleSheet, TextInput, View } from 'react-native';

import { VerseListItem } from '@/components/verse-list-item';
import { Chip, Empty, IconButton, Row, Screen, Txt } from '@/components/ui';
import { useLive } from '@/hooks/use-live';
import { useTheme } from '@/hooks/use-theme';
import { useTranslations } from '@/hooks/use-translation';
import { searchVerses } from '@/lib/data';

export default function SearchScreen() {
  const t = useTheme();
  const { current, lang } = useTranslations();
  const es = lang === 'es';
  const [q, setQ] = useState('');
  const [debounced, setDebounced] = useState('');
  const [scope, setScope] = useState<'all' | 'OT' | 'NT'>('all');

  useEffect(() => {
    const id = setTimeout(() => setDebounced(q), 300);
    return () => clearTimeout(id);
  }, [q]);

  const results = useLive(
    (db) => (current && debounced.trim().length >= 2 ? searchVerses(db, current.id, debounced, scope) : Promise.resolve([])),
    [current?.id, debounced, scope],
    ['translations']
  );

  return (
    <Screen>
      <Row>
        <IconButton icon="chevron-back" label="Back" onPress={() => (router.canGoBack() ? router.back() : router.navigate('/read'))} />
        <Txt variant="title" style={{ flex: 1 }}>
          {es ? 'Buscar' : 'Search'}
        </Txt>
        {current && (
          <Txt variant="label" muted>
            {current.abbr}
          </Txt>
        )}
      </Row>
      <TextInput
        value={q}
        onChangeText={setQ}
        autoFocus
        placeholder={es ? 'Palabras… (ej. "amor paciente")' : 'Words… (e.g. "love patient")'}
        placeholderTextColor={t.textSecondary}
        style={[styles.input, { color: t.text, borderColor: t.border, backgroundColor: t.card }]}
        returnKeyType="search"
      />
      <Row style={{ marginVertical: 12 }}>
        <Chip label={es ? 'Toda la Biblia' : 'Whole Bible'} selected={scope === 'all'} onPress={() => setScope('all')} />
        <Chip label={es ? 'A.T.' : 'OT'} selected={scope === 'OT'} onPress={() => setScope('OT')} />
        <Chip label={es ? 'N.T.' : 'NT'} selected={scope === 'NT'} onPress={() => setScope('NT')} />
      </Row>
      {debounced.trim().length >= 2 && results && (
        <Txt variant="small" muted style={{ marginBottom: 8 }}>
          {results.length >= 300 ? '300+' : results.length} {es ? 'resultados' : 'results'}
        </Txt>
      )}
      <View style={{ gap: 10 }}>
        {debounced.trim().length < 2 ? (
          <Empty icon="search" title={es ? 'Busca en la Biblia' : 'Search the Bible'} body={es ? 'No importan los acentos ni las mayúsculas.' : 'Accents and capital letters don’t matter.'} />
        ) : (
          results?.map((r) => <VerseListItem key={`${r.book}:${r.ch}:${r.v}`} book={r.book} ch={r.ch} v={r.v} text={r.text} lang={lang} />)
        )}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  input: { borderWidth: 1, borderRadius: 14, paddingHorizontal: 14, paddingVertical: 12, fontSize: 17, marginTop: 12 },
});
