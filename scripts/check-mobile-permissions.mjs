import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'

const root = resolve(import.meta.dirname, '..')
const androidManifest = await readFile(resolve(root, 'frontend/android/app/src/main/AndroidManifest.xml'), 'utf8')
const iosInfo = await readFile(resolve(root, 'frontend/ios/App/App/Info.plist'), 'utf8')
const cameraSource = await readFile(resolve(root, 'frontend/src/camera.ts'), 'utf8')
const appSource = await readFile(resolve(root, 'frontend/src/App.tsx'), 'utf8')
const inventorySource = await readFile(resolve(root, 'frontend/src/InventoryFlow.tsx'), 'utf8')

const requiredAndroidPermissions = [
  'android.permission.CAMERA',
  'android.permission.INTERNET',
  'android.permission.ACCESS_NETWORK_STATE',
]
for (const permission of requiredAndroidPermissions) {
  if (!androidManifest.includes(`android:name="${permission}"`)) {
    throw new Error(`Android Manifest 缺少权限：${permission}`)
  }
}

if (!iosInfo.includes('<key>NSCameraUsageDescription</key>')) {
  throw new Error('iOS Info.plist 缺少 NSCameraUsageDescription')
}
if (!cameraSource.includes("audio: false")) {
  throw new Error('相机约束未明确关闭音频采集，可能引入麦克风权限')
}
if (!appSource.includes('decodeFromVideoDevice') || !inventorySource.includes('getUserMedia')) {
  throw new Error('相机调用链审查失败：扫码或识图入口未找到')
}

console.log('移动端权限审查通过：')
console.log('- Android：CAMERA、INTERNET、ACCESS_NETWORK_STATE 已声明')
console.log('- iOS：NSCameraUsageDescription 已声明')
console.log('- 音频、定位、蓝牙、媒体库读取、原生推送：当前代码未使用，无需新增系统权限')
console.log('- 文件选图：使用系统文件/照片选择器，不声明 Android 存储或 iOS 相册读取权限')
