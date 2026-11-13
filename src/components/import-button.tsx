import { useSQLiteContext } from 'expo-sqlite';
import { useState } from 'react';
import { Alert, Platform, View } from 'react-native';

import { Button, ProgressBar, Txt } from '@/components/ui';
import { useT } from '@/i18n';
import { importBible, pickBibleFiles, type ImportProgress } from '@/lib/importer';
import { getSettings, updateSettings } from '@/lib/settings';

function notifyUser(title: string, msg: string) {
  if (Platform.OS === 'web') window.alert(`${title}\n\n${msg}`);
  else Alert.alert(title, msg);
}

/** "Import Bible" button: pick .bblx files and load them into the app. */
export function ImportButton({ label }: { label?: string }) {
  const { t: tr } = useT();
  const db = useSQLiteContext();
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<(ImportProgress & { file: string }) | null>(null);

  const run = async () => {
    const assets = await pickBibleFiles();
    if (!assets.length) return;
    setBusy(true);
    const ok: string[] = [];
    const failed: string[] = [];
    for (const a of assets) {
      try {
        const res = await importBible(db, a, (p) => setProgress({ ...p, file: a.name }));
        ok.push(`${res.name} (${tr('import.versesCount', { n: res.verses.toLocaleString() })})`);
        if (!getSettings().translationId) updateSettings({ translationId: res.id });
      } catch (e) {
        failed.push(e instanceof Error ? e.message : String(e));
      }
    }
    setBusy(false);
    setProgress(null);
    const parts = [];
    if (ok.length) parts.push(`${tr('import.imported')}\n• ${ok.join('\n• ')}`);
    if (failed.length) parts.push(`${tr('import.notImported')}\n• ${failed.join('\n• ')}`);
    notifyUser(failed.length && !ok.length ? tr('import.failed') : tr('import.finished'), parts.join('\n\n'));
  };

  return (
    <View style={{ gap: 10 }}>
      <Button title={label ?? tr('import.button')} icon="download-outline" onPress={run} loading={busy} />
      {progress && (
        <View style={{ gap: 6 }}>
          <Txt variant="small" muted numberOfLines={1}>
            {progress.stage} · {progress.file}
          </Txt>
          <ProgressBar value={progress.total ? progress.done / progress.total : 0} />
        </View>
      )}
    </View>
  );
}
