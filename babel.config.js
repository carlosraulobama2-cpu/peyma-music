// @ts-check
/** @type {import('@babel/core').ConfigFunction} */
module.exports = function (api) {
  api.cache(true);
  return {
    presets: ['babel-preset-expo'],
    plugins: [
      // Reanimated 4 usa el plugin de react-native-worklets.
      // (react-native-reanimated/plugin quedó obsoleto en la v4.)
      'react-native-worklets/plugin',
    ],
  };
};
