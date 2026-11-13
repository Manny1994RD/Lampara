import { router } from 'expo-router';

import { AccountForm } from '@/components/account-form';
import { IconButton, Row, Screen, Txt } from '@/components/ui';
import { useT } from '@/i18n';

/** Sign in, accept an invitation, or reset a forgotten password (from Settings or Friends). */
export default function HubScreen() {
  const { t: tr } = useT();
  const back = () => (router.canGoBack() ? router.back() : router.navigate('/settings'));

  return (
    <Screen maxWidth={560}>
      <Row>
        <IconButton icon="chevron-back" label={tr('common.back')} onPress={back} />
        <Txt variant="title" style={{ flex: 1 }}>
          {tr('settings.connect')}
        </Txt>
      </Row>
      <Txt muted style={{ marginBottom: 16 }}>
        {tr('hub.intro')}
      </Txt>
      <AccountForm initialMode="signin" onDone={back} />
    </Screen>
  );
}
