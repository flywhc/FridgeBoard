import type { CapacitorConfig } from '@capacitor/cli'

const config: CapacitorConfig = {
  appId: 'com.fridgeboard.app',
  appName: '家常食橱',
  webDir: 'dist',
  bundledWebRuntime: false,
  loggingBehavior: 'none',
  backgroundColor: '#EBE6DD',
  android: {
    backgroundColor: '#EBE6DD',
  },
  ios: {
    backgroundColor: '#EBE6DD',
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
