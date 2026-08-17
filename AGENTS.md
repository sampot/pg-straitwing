# AGENTS.md（pg-straitwing）

本 repo 是山姆鍋遊樂場（Playgrounds）的一款 `kind: game` SAM：**海峽空戰**，俯視狗鬥射擊。

**開發前必讀（唯一權威契約）：** [`playgrounds/docs/PG-GAME-AGENT-GUIDE.md`](https://github.com/sampot/playgrounds/blob/main/docs/PG-GAME-AGENT-GUIDE.md)
（本檔只是指針；**不要**把該指南全文拷進本 repo。）

本 repo 的硬約束摘要：

- 僅 HTML／CSS／JS，無 build、`node_modules` 不入庫、不外連 CDN
- 不自行載入 `sdk.js`；宿主注入 `window.PG`
- 進度／最佳分數以 `PG.kv`（`/api/kv`）為權威，**不用**裸 `localStorage`
- 禁用 `alert`／`confirm`／`prompt`：一律頁內面板（見 `src/app.js` 的 `setOverlay`）
- Mobile-first；連續移動用浮動類比搖桿（`src/stick.js`／`src/input.js`），非小方向鍵
- 素材已拷進 `assets/`，署名見 `ATTRIBUTION.md`（CC0 亦署名）

改動可執行邏輯前**先寫失敗測試**：`npx vitest run`（測試在 `tests/`）。
