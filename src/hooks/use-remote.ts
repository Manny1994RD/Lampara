import { useEffect, useEffectEvent, useState } from 'react';

import { subscribe, type Topic } from '@/lib/db';

/** Loads data from the hub; reloads when `deps` change or one of `topics` is notified. */
export function useRemote<T>(load: () => Promise<T>, deps: unknown[], topics: Topic[] = ['social', 'hub']) {
  const [state, setState] = useState<{ data?: T; error?: string; loading: boolean }>({ loading: true });
  const [tick, setTick] = useState(0);
  const depsKey = JSON.stringify(deps);
  const topicsKey = topics.join(',');
  const runLoad = useEffectEvent(() => load());
  const listens = useEffectEvent((t: Topic) => topics.includes(t));

  useEffect(() => {
    let alive = true;
    let seq = 0;
    const run = () => {
      const mine = ++seq;
      runLoad()
        .then((data) => alive && mine === seq && setState({ data, loading: false }))
        .catch((e) => alive && mine === seq && setState((s) => ({ data: s.data, error: e instanceof Error ? e.message : String(e), loading: false })));
    };
    run();
    const unsub = subscribe((t) => {
      if (listens(t)) run();
    });
    return () => {
      alive = false;
      unsub();
    };
  }, [depsKey, topicsKey, tick]);

  return { ...state, reload: () => setTick((n) => n + 1) };
}
