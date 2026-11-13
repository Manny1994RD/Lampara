import { useSQLiteContext } from 'expo-sqlite';
import { useState } from 'react';
import { Alert, Platform, View } from 'react-native';

import { Button, ProgressBar, Txt } from '@/components/ui';
import { importBible, pickBibleFiles, type ImportProgress } from '@/lib/importer';
import { getSettings, updateSettings } from '@/lib/settings';

function notifyUser(title: string, msg: string) {
  if (Platform.OS === 'web') window.alert(`${title}\n\n${msg}`);
  else Alert.alert(title, msg);
}

/** "Import Bible" button: pick .bblx files and load them into the app. */
export function ImportButton({ label = 'Import Bible (.bblx)' }: { label?: string }) {
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
        ok.push(`${res.name} (${res.verses.toLocaleString()} verses)`);
        if (!getSettings().translationId) updateSettings({ translationId: res.id });
      } catch (e) {
        failed.push(e instanceof Error ? e.message : String(e));
      }
    }
    setBusy(false);
    setProgress(null);
    const parts = [];
    if (ok.length) parts.push(`Imported:\n• ${ok.join('\n• ')}`);
    if (failed.length) parts.push(`Not imported:\n• ${failed.join('\n• ')}`);
    notifyUser(failed.length && !ok.length ? 'Import failed' : 'Import finished', parts.join('\n\n'));
  };

  return (
    <View style={{ gap: 10 }}>
      <Button title={label} icon="download-outline" onPress={run} loading={busy} />
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
