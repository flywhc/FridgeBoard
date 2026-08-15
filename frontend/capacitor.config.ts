import type { CapacitorConfig } from '@capacitor/cli'

const config: CapacitorConfig = {
  appId: 'com.fridgeboard.app',
  appName: '家常食橱',
  webDir: 'dist',
  bundledWebRuntime: false,
  backgroundColor: '#FFFFFF',
  android: {
    backgroundColor: '#FFFFFF',
  },
  ios: {
    backgroundColor: '#FFFFFF',
    contentInset: 'never',
  },
  plugins: {
    SplashScreen: {
      launchAutoHide: true,
    },
    SystemBars: {
      insetsHandling: 'css',
      style: 'LIGHT',
      hidden: false,
      animation: 'NONE',
    },
  },
}

export default config
