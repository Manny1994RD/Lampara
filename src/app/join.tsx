import { Redirect, useLocalSearchParams } from 'expo-router';

/**
 * Invitation link: https://<hub>/join?code=ABC123 opens the welcome steps with the code filled in.
 * On the website served by the hub, the server address is the page itself.
 */
export default function JoinLink() {
  const { code, hub } = useLocalSearchParams<{ code?: string; hub?: string }>();
  return <Redirect href={{ pathname: '/welcome', params: { code: code ?? '', ...(hub ? { hub } : {}) } }} />;
}
