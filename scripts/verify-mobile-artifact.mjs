import { mkdtempSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";

function fail(message) {
  throw new Error(message);
}

function readOption(name) {
  const index = process.argv.indexOf(name);
  if (index < 0 || !process.argv[index + 1]) fail(`缺少参数 ${name}`);
  return process.argv[index + 1];
}

function run(command, args) {
  const result = spawnSync(command, args, { encoding: "utf8", stdio: "pipe" });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    fail(`命令失败：${command} ${args.join(" ")}\n${result.stderr || result.stdout}`);
  }
  return result.stdout.trim();
}

function findApkanalyzer() {
  const candidates = [
    process.env.ANDROID_APKANALYZER,
    "apkanalyzer",
    process.env.ANDROID_HOME && path.join(process.env.ANDROID_HOME, "cmdline-tools/latest/bin/apkanalyzer"),
    process.env.ANDROID_SDK_ROOT && path.join(process.env.ANDROID_SDK_ROOT, "cmdline-tools/latest/bin/apkanalyzer"),
  ].filter(Boolean);
  for (const candidate of candidates) {
    const result = spawnSync(candidate, ["--help"], { encoding: "utf8", stdio: "ignore" });
    if (!result.error && result.status === 0) return candidate;
  }
  fail("未找到 apkanalyzer，请设置 ANDROID_APKANALYZER 或安装 Android SDK command-line tools。");
}

function verifyApk(filePath, expectedVersion, expectedBuild, expectedPackage) {
  const analyzer = findApkanalyzer();
  const packageName = run(analyzer, ["manifest", "application-id", filePath]);
  const versionName = run(analyzer, ["manifest", "version-name", filePath]);
  const versionCode = run(analyzer, ["manifest", "version-code", filePath]);
  if (packageName !== expectedPackage) fail(`APK 包名不匹配：${packageName}`);
  if (versionName !== expectedVersion) fail(`APK 版本不匹配：${versionName}`);
  if (versionCode !== expectedBuild) fail(`APK 构建号不匹配：${versionCode}`);
  return { packageName, versionName, versionCode };
}

function verifyIpa(filePath, expectedVersion, expectedBuild, expectedPackage) {
  const tempPath = mkdtempSync(path.join(tmpdir(), "fridgeboard-ipa-"));
  try {
    run("unzip", ["-q", "-o", filePath, "Payload/*.app/Info.plist", "-d", tempPath]);
    const plistPath = run("find", [tempPath, "-path", "*/Payload/*.app/Info.plist", "-type", "f", "-print", "-quit"]);
    if (!plistPath) fail("IPA 中未找到 Payload/*.app/Info.plist。");
    const readPlist = (key) => run("plutil", ["-extract", key, "raw", "-o", "-", plistPath]);
    const packageName = readPlist("CFBundleIdentifier");
    const versionName = readPlist("CFBundleShortVersionString");
    const versionCode = readPlist("CFBundleVersion");
    if (packageName !== expectedPackage) fail(`IPA Bundle ID 不匹配：${packageName}`);
    if (versionName !== expectedVersion) fail(`IPA 版本不匹配：${versionName}`);
    if (versionCode !== expectedBuild) fail(`IPA 构建号不匹配：${versionCode}`);
    return { packageName, versionName, versionCode };
  } finally {
    rmSync(tempPath, { force: true, recursive: true });
  }
}

const platform = readOption("--platform");
const filePath = path.resolve(readOption("--path"));
const expectedVersion = readOption("--version");
const expectedBuild = readOption("--build-number");
const expectedPackage = process.argv.includes("--package") ? readOption("--package") : "com.fridgeboard.app";
if (!statSync(filePath).isFile()) fail(`产物不存在：${filePath}`);

const metadata = platform === "android"
  ? verifyApk(filePath, expectedVersion, expectedBuild, expectedPackage)
  : platform === "ios"
    ? verifyIpa(filePath, expectedVersion, expectedBuild, expectedPackage)
    : fail(`不支持的平台：${platform}`);

console.log(JSON.stringify({ platform, path: filePath, bytes: statSync(filePath).size, ...metadata }));
