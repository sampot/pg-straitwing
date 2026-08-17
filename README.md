# 海峽空戰（pg-straitwing）

俯視狗鬥射擊：你是海峽上空唯一還能升空的攔截機，五個任務一關比一關硬。

- **平台：** 山姆鍋遊樂場（Playgrounds）SAM，`kind: game`
- **交付：** 純 HTML／CSS／JS，無 build、無 `node_modules`、無 CDN
- **執行期：** 宿主注入 `window.PG`；進度走 `PG.kv`（即 `/api/kv`）

## 玩法

俯視視角在海峽上空纏鬥。飛機永遠在飛（不會停在空中），你要靠轉向咬住敵機尾巴開火，同時甩掉咬著你的敵機。

| 系統 | 說明 |
| --- | --- |
| 機砲 | 按住連射，但**會過熱**；量表滿了就鎖住，得放手等冷卻（或撿冷卻劑） |
| 熱焰彈 | 燒掉身邊的敵彈並短暫無敵，被咬尾時的活路；數量有限 |
| 補給 | 敵機墜落有機率掉維修包／熱焰彈／冷卻劑 |
| 邊界 | 海峽有界，靠近邊緣會出現紅色警示並被推回 |

### 任務鏈（五關，難度遞增）

| 關 | 任務 | 過關條件 | 失敗條件 |
| --- | --- | --- | --- |
| 1 | 攔截來襲 | 擊落 6 架敵戰機 | 座機被擊落 |
| 2 | 護航船團 | 至少 1 架運補機進港 | 運補機全滅 |
| 3 | 制壓巡邏艇 | 擊沉 4 艘巡邏艇 | 座機被擊落 |
| 4 | 空優作戰 | 3 架轟炸機全數解決 | 漏掉 2 架轟炸機 |
| 5 | 王牌決戰 | 擊落海峽王牌 | 座機被擊落 |

過關會依剩餘機體、熱焰彈與用時給任務加給；通關進度與最佳分數存在場內 KV，關卡逐關解鎖。

## 操作

**手機（mobile-first）**

- 左下角**任意處按住**＝浮動類比搖桿（第一個觸點即圓心，可 360° 微調）
- 右下 **開火**（84×84）按住連射、**熱焰**（64×64）放反制彈
- 依 `PG-GAME-AGENT-GUIDE` §3.2：類比搖桿而非小方向鍵；一律 Pointer Events，放開／`pointercancel`／換頁即歸零

**鍵盤**

| 鍵 | 動作 |
| --- | --- |
| `WASD`／方向鍵 | 飛行 |
| `J`／`Space`／`Z` | 機砲 |
| `K`／`Shift`／`X` | 熱焰彈 |
| `P`／`Esc` | 暫停 |

## 檔案

```text
index.html          入口
styles.css          手機優先版面（min-width 才加寬）
src/vec.js          角度／向量／可重現 RNG
src/combat.js       機砲過熱、命中、預瞄提前量、傷害
src/ai.js           追擊、轟炸航路、砲塔、目標選擇（純函式）
src/units.js        機種／艦艇／補給數值與關卡倍率
src/levels.js       五關任務定義與目標文案
src/game.js         狀態機：createGame／startLevel／step／objectives
src/progress.js     存檔正規化、最佳分數、關卡解鎖
src/persist.js      PG.kv（退回 /api/kv raw）
src/stick.js        搖桿／鍵盤軸向數學
src/input.js        Pointer＋鍵盤 → { moveX, moveY, primary, secondary }
src/render.js       canvas 2D：海面、島嶼、雲、機影、彈道、爆炸
src/audio.js        音效池與音樂床、事件→音效對應
src/app.js          組裝：rAF 迴圈、HUD、頁內面板
tests/              vitest（70 tests）
assets/             美術／音效／音樂／授權（全部拷進本 repo）
```

`src/game.js` 的 `step(state, input, dt)` 會**就地更新** state（一秒 60 次，複製整個實體陣列純屬浪費）；測試因此驗規則與結果，而不是驗不可變性。

## 測試

```bash
npx vitest run
```

70 個測試涵蓋：轉向與角度、機砲過熱與解鎖、命中與提前量、AI 開火條件與目標選擇、五關各自的勝敗判定、補給效果、增援上限、關卡難度遞增、同 seed 同輸入的決定性重播，以及長時間模擬不爆數值。

## 素材

美術：Kenney「Pixel Shmup」（CC0）。音效：Kenney「Sci-Fi Sounds」、「Music Jingles」（CC0）。音樂：Not Jam「Not Jam Music Pack」（CC0）。封面由本 repo 內 CC0 精靈合成。即使授權不要求署名仍署名——見 [`ATTRIBUTION.md`](./ATTRIBUTION.md) 與 `assets/licenses/`。
