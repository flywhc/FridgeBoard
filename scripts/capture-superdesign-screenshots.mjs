/**
 * Playwright CLI `run-code --filename` payload.
 *
 * Run this only while the local docs/ui-assets static server is available on
 * port 8765. The browser receives `page` from Playwright CLI.
 */
async page => {
  const drafts = [
    ["eink-home", 600, 800], ["eink-shelf-detail", 600, 800],
    ["eink-pairing-qr", 600, 800], ["eink-unconfigured", 600, 800],
    ["pwa-ios-install", 390, 844], ["pwa-android-install", 390, 844],
    ["pwa-pairing-success", 390, 844], ["pwa-create-fridge", 390, 844],
    ["pwa-layout-preview", 390, 844], ["pwa-layout-editor", 390, 844],
    ["pwa-add-food", 390, 844], ["pwa-confirm-location", 390, 844],
    ["pwa-subcategory-library", 390, 844], ["pwa-custom-icon", 390, 844],
    ["pwa-ai-recognition", 390, 844], ["pwa-edit-food", 390, 844],
    ["pwa-home", 390, 844], ["pwa-weekly-recipes", 390, 844],
    ["pwa-recipe-import", 390, 844], ["pwa-recipe-edit", 390, 844],
    ["pwa-restock-list", 390, 844], ["pwa-fridge-management", 390, 844],
    ["pwa-fridge-switcher", 390, 844], ["pwa-notifications", 390, 844],
    ["pwa-expiry-rules", 390, 844],
  ];

  for (const [slug, width, height] of drafts) {
    await page.setViewportSize({ width, height });
    await page.goto(`http://127.0.0.1:8765/html/${slug}.html`, { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(300);
    await page.screenshot({
      path: `/Users/jason/projects/FridgeBoard/docs/ui-assets/png/${slug}.png`,
      scale: "css",
      type: "png",
    });
  }
}
