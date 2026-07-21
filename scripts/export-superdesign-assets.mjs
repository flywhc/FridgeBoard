#!/usr/bin/env node

/**
 * Export the confirmed Superdesign drafts to repository-local HTML assets.
 *
 * The source previews are remote and may not be available to later Codex
 * sessions. This script records the exact returned draft HTML and metadata so
 * UI implementation can proceed without relying on browser preview access.
 */
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const outputDirectory = resolve("docs/ui-assets");
const htmlDirectory = resolve(outputDirectory, "html");

const drafts = [
  ["eink-home", "620a23a7-f6f1-446f-b877-f05317a2c0a2", "墨水屏拟物冰箱首页", 600, 800],
  ["eink-shelf-detail", "11377443-ce1a-49d7-8c87-9860db491c17", "墨水屏分区详情与拿走操作", 600, 800],
  ["eink-pairing-qr", "8b177d38-c76d-47d6-b015-cb04fe1ee984", "墨水屏已配置冰箱配对二维码", 600, 800],
  ["eink-unconfigured", "74a1eaf3-b877-4a4f-baf9-c9960febfbd7", "墨水屏首次开机未配置状态", 600, 800],
  ["pwa-ios-install", "f616c336-1e64-4721-800d-6fc75c4cb776", "iOS 浏览器安装引导", 390, 844],
  ["pwa-android-install", "0a461204-851c-4b9c-aeed-da6e2cdded37", "Android 浏览器安装引导", 390, 844],
  ["pwa-pairing-success", "e6f22671-6891-4b4f-8d3d-26d7cfcc9d67", "PWA 自动配对成功", 390, 844],
  ["pwa-create-fridge", "7c1a3a02-a6bf-4c1d-b476-0e4c1bd4e31d", "创建冰箱名称与模板", 390, 844],
  ["pwa-layout-preview", "e5c35dea-610f-42f9-878b-1f716c2e7d4f", "冰箱布局预览", 390, 844],
  ["pwa-layout-editor", "145b32f6-007a-4698-9ea7-3963dfc04a38", "布局分格编辑", 390, 844],
  ["pwa-add-food", "e4a227ed-0c1c-4f72-8ed0-0af7ab18d668", "添加食材识别与基础信息", 390, 844],
  ["pwa-confirm-location", "0b3efe77-bdf1-49e7-a8b2-08bb17c9f7a8", "确认位置与数量", 390, 844],
  ["pwa-subcategory-library", "284a5039-9042-484e-b683-b8504875a7e4", "小类图库", 390, 844],
  ["pwa-custom-icon", "eabace7d-43c5-4326-901f-eaf29b04fda7", "自定义小类与 AI 图标确认", 390, 844],
  ["pwa-ai-recognition", "36284a96-d2ad-4fce-96b8-c59af859dc8d", "AI 识别结果与冲突确认", 390, 844],
  ["pwa-edit-food", "7224e71b-8055-40ec-a9a9-db68b6744764", "编辑既有食材", 390, 844],
  ["pwa-home", "23329191-d0fa-48ca-a517-fee9ff3eab9b", "当前冰箱首页", 390, 844],
  ["pwa-weekly-recipes", "b2e77ba8-52dd-4722-8e89-accdf9f3569f", "本周下周食谱", 390, 844],
  ["pwa-recipe-import", "ef62678e-0a73-431a-93c6-794f646f5c74", "粘贴食谱导入", 390, 844],
  ["pwa-recipe-edit", "bbeda1ae-e99c-40d6-87b3-90cdedd7adfa", "单日食谱编辑", 390, 844],
  ["pwa-restock-list", "903728d2-d6b9-4918-82b5-9d3ab6b3aafb", "动态补货清单", 390, 844],
  ["pwa-fridge-management", "1bfa869c-6942-4c89-b275-83e9a02c04e1", "冰箱管理与设备访问", 390, 844],
  ["pwa-fridge-switcher", "6e7893ee-74d5-4aa4-9db4-45be02e7f9b5", "我的冰箱切换", 390, 844],
  ["pwa-notifications", "4a046922-ecdb-4d7b-8836-2c022283f6b5", "提醒设置", 390, 844],
  ["pwa-expiry-rules", "c24f9644-0bd1-493a-979e-2d0218e3a6cc", "临期规则设置", 390, 844],
];

mkdirSync(htmlDirectory, { recursive: true });

const exportedDrafts = drafts.map(([slug, draftId, title, width, height]) => {
  const htmlPath = resolve(htmlDirectory, `${slug}.html`);
  let currentVersion = null;

  if (!existsSync(htmlPath)) {
    const output = execFileSync(
      "npx",
      ["--yes", "@superdesign/cli@latest", "get-design", "--draft-id", draftId, "--json"],
      { encoding: "utf8", maxBuffer: 10 * 1024 * 1024 },
    );
    const design = JSON.parse(output);

    if (design.draftId !== draftId || typeof design.htmlContent !== "string") {
      throw new Error(`草稿 ${draftId} 未返回可导出的 HTML`);
    }

    writeFileSync(htmlPath, design.htmlContent, "utf8");
    currentVersion = design.currentVersion;
  }

  return {
    slug,
    title,
    draftId,
    previewUrl: `https://p.superdesign.dev/draft/${draftId}`,
    viewport: { width, height },
    htmlPath: `html/${slug}.html`,
    pngPath: `png/${slug}.png`,
    currentVersion,
  };
});

writeFileSync(
  resolve(outputDirectory, "manifest.json"),
  `${JSON.stringify(
    {
      exportedAt: new Date().toISOString(),
      source: "Superdesign confirmed final drafts",
      drafts: exportedDrafts,
    },
    null,
    2,
  )}\n`,
  "utf8",
);

console.log(`已导出 ${exportedDrafts.length} 个最终草稿到 ${outputDirectory}`);
