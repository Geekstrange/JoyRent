// File Name: babel.config.js
// Created Time: 2026-09-22 20:00:21
// Update Time: 2026-09-22 20:00:21


module.exports = {
  presets: [
    [
      'taro',
      {
        framework: 'react',
        ts: true,
        compiler: 'webpack5',
      },
    ],
  ],
}
