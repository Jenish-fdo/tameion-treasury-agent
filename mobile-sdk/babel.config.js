module.exports = {
  presets: ['module:@react-native/babel-preset'],
  plugins: [
    [
      'module-resolver',
      {
        root: ['./src'],
        extensions: ['.ios.js', '.android.js', '.js', '.ts', '.tsx', '.json'],
        alias: {
          '@': './src',
          '@/components': './src/components',
          '@/hooks': './src/hooks',
          '@/lib': './src/lib',
          '@/types': './src/types',
          '@/screens': './src/screens',
          '@/navigation': './src/navigation',
        },
      },
    ],
    'react-native-reanimated/plugin',
  ],
};
