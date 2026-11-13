// Adds the expo-widgets home-screen widgets on Android only.
// (The package's own plugin always adds an iPhone widget extension too, which needs its own
// Apple provisioning profile; we don't have an iPhone widget yet.)
const { createRunOncePlugin } = require('expo/config-plugins');
const withAndroidWidgets = require('expo-widgets/plugin/build/android/withAndroidWidgets').default;

const withLamparaWidgets = (config, props = {}) => withAndroidWidgets(config, { ...props, widgets: props.widgets ?? [] });

module.exports = createRunOncePlugin(withLamparaWidgets, 'lampara-android-widgets', '1.0.0');
