// Extends app.json.
// iPhone builds: the Xcode project needs a plain-letter name. With "Lámpara", Expo names the project
// "Lampara" but EAS Build looks for "Lmpara" and fails ("scheme 'Lmpara' does not exist").
// The name shown under the icon stays "Lámpara" (CFBundleDisplayName). Android is unchanged.
// Switched on by LAMPARA_IOS=1 in the iOS build profiles (eas.json), so this PC and the EAS builder
// evaluate the same config (they must agree for the update fingerprint).
module.exports = ({ config }) => {
  if (process.env.LAMPARA_IOS !== '1') return config;
  return {
    ...config,
    name: 'Lampara',
    ios: {
      ...config.ios,
      infoPlist: { ...(config.ios?.infoPlist ?? {}), CFBundleDisplayName: 'Lámpara' },
    },
  };
};
