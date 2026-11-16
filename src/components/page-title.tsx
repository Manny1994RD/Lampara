import { router } from 'expo-router';
import type { ReactNode } from 'react';

import { IconButton, Row, Txt } from '@/components/ui';
import { useT } from '@/i18n';

/** Back arrow + title for screens opened from the Yo tab (Mis versículos, Amigos y retos, Ajustes). */
export function PageTitle({ title, right }: { title: string; right?: ReactNode }) {
  const { t: tr } = useT();
  return (
    <Row style={{ justifyContent: 'space-between' }}>
      <IconButton icon="chevron-back" label={tr('common.back')} onPress={() => (router.canGoBack() ? router.back() : router.navigate('/me'))} />
      <Txt variant="title" style={{ flex: 1 }} numberOfLines={1}>
        {title}
      </Txt>
      {right}
    </Row>
  );
}
