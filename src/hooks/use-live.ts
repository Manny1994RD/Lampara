import { useSQLiteContext, type SQLiteDatabase } from 'expo-sqlite';
import { useEffect, useEffectEvent, useState } from 'react';

import { subscribe, type Topic } from '@/lib/db';

/**
 * Runs an async query and re-runs it whenever one of `topics` changes
 * (or when `deps` change). Returns `undefined` until the first result arrives.
 */
export function useLive<T>(
  query: (db: SQLiteDatabase) => Promise<T>,
  deps: unknown[],
  topics: Topic[]
): T | undefined {
  const db = useSQLiteContext();
  const [data, setData] = useState<T>();
  const depsKey = JSON.stringify(deps);
  const topicsKey = topics.join(',');

  const runQuery = useEffectEvent(() => query(db));
  const listensTo = useEffectEvent((t: Topic) => topics.includes(t));

  useEffect(() => {
    let seq = 0;
    let alive = true;
    const run = () => {
      const mine = ++seq;
      runQuery()
        .then((res) => {
          if (alive && mine === seq) setData(res);
        })
        .catch((e) => console.warn('query failed', e));
    };
    run();
    const unsub = subscribe((t) => {
      if (listensTo(t)) run();
    });
    return () => {
      alive = false;
      unsub();
    };
  }, [db, depsKey, topicsKey]);

  return data;
}
