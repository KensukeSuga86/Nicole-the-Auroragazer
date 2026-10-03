# CHANGELOG

## 2026-10-03 — iPhone narrow-screen layout hotfix
- Prevented page-level horizontal overflow on narrow iPhone screens.
- Made tables scroll inside their own containers instead of widening the page.
- Made forms, settings controls, panel headers, dialogs and search results fit the viewport.
- Bumped the PWA shell cache to `mobile-r4`.
- Limited Service Worker cache cleanup to Nicole 3 cache names only.

## v0.2.0 — 2026-10-02

### Added
- アプリ内マニュアルを追加
- オーロラの生成メカニズム、色、CME、太陽風、IMF Bz、Kp、Dst、OVATIONの解説を追加
- NOAA OVATIONの北半球・南半球・両半球極投影マップを実装
- OVATION短時間予測とKp中期予報を分離
- Nicole INDEXをActivity / Visibilityの2軸へ拡張
- 判定理由の可視化
- 肉眼 / カメラ判定
- 低緯度オーロラの距離・方位・見かけ高度計算
- Open-Meteoによる雲量・降水・視程・日月条件
- Bortleクラスと北側地平線遮蔽の手動補正
- NASA DONKI CME / GST / IPSイベント表示
- NOAA Alerts表示
- 地点検索、お気に入り、地点比較
- 周辺9地点の今夜条件比較
- 方位センサー対応「空で見る」
- 撮影アシスタント
- 通知
- IndexedDB OVATIONスナップショットとローカル履歴再生
- 教育アニメーション
- PWA shell cache
- 設定 / お気に入りJSON書き出し
- NOAA 2026年新JSON形式と旧形式の互換パーサー

### Notes
- OVATIONは30分程度の短時間予測として扱う
- Nicole INDEXは確率表示を行わない
