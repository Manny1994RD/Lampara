import { DarkTheme, DefaultTheme, Stack, ThemeProvider } from 'expo-router';
import { SQLiteProvider } from 'expo-sqlite';
import { StatusBar } from 'expo-status-bar';
import { Suspense } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { DatabaseBoundary } from '@/components/db-boundary';
import { HubSync } from '@/components/hub-sync';
import { NotificationScheduler } from '@/components/notification-scheduler';
import { Colors } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { DB_NAME, migrateDb } from '@/lib/db';

export default function RootLayout() {
  const scheme = useColorScheme();
  const dark = scheme === 'dark';
  const c = dark ? Colors.dark : Colors.light;
  const navTheme = {
    ...(dark ? DarkTheme : DefaultTheme),
    colors: {
      ...(dark ? DarkTheme : DefaultTheme).colors,
      background: c.background,
      card: c.card,
      text: c.text,
      border: c.border,
      primary: c.accent,
    },
  };

  return (
    <SafeAreaProvider>
      <ThemeProvider value={navTheme}>
        <StatusBar style={dark ? 'light' : 'dark'} />
        <DatabaseBoundary colors={c}>
          {(attempt) => (
            <Suspense
              key={attempt}
              fallback={
                <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: c.background }}>
                  <ActivityIndicator color={c.accent} />
                </View>
              }>
              <SQLiteProvider databaseName={DB_NAME} onInit={migrateDb} useSuspense>
                <NotificationScheduler />
                <HubSync />
                <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: c.background } }}>
                  <Stack.Screen name="(tabs)" />
                  <Stack.Screen name="search" options={{ presentation: 'modal' }} />
                  <Stack.Screen name="topic/[id]" />
                  <Stack.Screen name="plans" />
                  <Stack.Screen name="plan/[id]" />
                  <Stack.Screen name="badges" />
                  <Stack.Screen name="hub" />
                  <Stack.Screen name="results" />
                  <Stack.Screen name="challenge/new" />
                  <Stack.Screen name="challenge/[id]" />
                </Stack>
              </SQLiteProvider>
            </Suspense>
          )}
        </DatabaseBoundary>
      </ThemeProvider>
    </SafeAreaProvider>
  );
}
