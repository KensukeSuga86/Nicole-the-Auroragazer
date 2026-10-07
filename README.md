# Nicole the Auroragazer v0.3.0

Nicoleシリーズ第3作。全球オーロラ監視、宇宙天気、低緯度オーロラの見え方、地上の観測条件、撮影・学習を一つにまとめたPWAです。

## 主な機能

- NOAA OVATIONの北半球 / 南半球 / 両半球マップ
- OVATION短時間予測とNOAA Kp 3日予報を分離表示
- Kp / IMF Bz / Bt / 太陽風速度 / Dst / OVATIONを統合した Nicole INDEX
- Nicole INDEXは確率ではなく0–100の条件指数。活動度と視認性を別表示
- 肉眼 / カメラの観測目安
- 低緯度オーロラの見かけ高度・方位を地球曲率から計算
- 雲量、降水、視程、太陽高度、月明かり、Bortle、地平線遮蔽を評価
- NASA DONKIのCME / GST / IPSイベント
- 地点検索、お気に入り、複数地点比較、周辺候補9地点比較
- スマートフォン方位センサーによる「空で見る」
- 撮影アシスタント
- ブラウザ通知
- OVATIONローカル履歴（IndexedDB、最大72件）と再生
- オーロラ生成メカニズムの教育モード
- アプリ内使い方、データ説明、オーロラ解説
- Service Worker / manifestによるPWA

## データソース

### NOAA Space Weather Prediction Center
- OVATION: `https://services.swpc.noaa.gov/json/ovation_aurora_latest.json`
- Planetary Kp: `https://services.swpc.noaa.gov/products/noaa-planetary-k-index.json`
- Kp forecast: `https://services.swpc.noaa.gov/products/noaa-planetary-k-index-forecast.json`
- Dst: `https://services.swpc.noaa.gov/products/kyoto-dst.json`
- Solar wind speed: `https://services.swpc.noaa.gov/products/summary/solar-wind-speed.json`
- IMF Bt/Bz: `https://services.swpc.noaa.gov/products/summary/solar-wind-mag-field.json`
- Alerts: `https://services.swpc.noaa.gov/products/alerts.json`

NOAAは2026年3月に複数JSONを標準オブジェクト形式へ変更しました。本版は旧「先頭行がヘッダー」の配列形式と、新しいオブジェクト形式の両方を受け入れます。

### NASA DONKI
`https://ccmc.gsfc.nasa.gov/DONKI-API/get/`（2026年9月30日に api.nasa.gov / kauai から移転。パラメータ・応答形式は同じ、APIキー不要）

### Open-Meteo
- Forecast API: 雲量、降水、視程、風、日の出入、月情報
- Geocoding API: 地点検索

Open-Meteoデータ利用時はOpen-Meteoへの帰属表示を維持してください。

## Nicole INDEX

Nicole INDEXはオーロラが見える「確率」ではありません。

### Activity 0–100
- Kp
- IMF Bz
- IMF Bt
- 太陽風速度
- Dst
- OVATION現在地近傍値
- 遠方オーロラ候補の見かけ高度

### Visibility 0–100
- 雲量
- 降水
- 太陽高度
- 月明かり
- Bortleクラス（手動）
- 地平線遮蔽（手動）

最終Nicole INDEXは Activity 67% + Visibility 33% で合成します。閾値や重みは `js/core.js` に明示しており、ブラックボックス化していません。

## 低緯度オーロラ幾何

OVATION上の候補点までの大円距離を求め、地球半径6371.0088 km、設定した発光高度（初期250 km）の球殻上に発光点があると仮定し、観測地点の局所水平面からの見かけ高度を計算します。

実際の発光高度は一定ではありません。赤色630.0 nm発光など高高度成分では結果が変わるため、設定で100–500 kmに変更できます。

## インストール / GitHub Pages

このフォルダの中身をリポジトリの公開ディレクトリへ配置してください。`index.html` がルートになる構成です。

GitHub PagesなどHTTPS環境で開くと、GPS、Service Worker、通知などが利用できます。`file://` 直開きではES Modules、Service Worker、位置情報等が制限されるため、HTTP/HTTPSサーバーで使用してください。

ローカル確認例:

```bash
python3 -m http.server 8080
```

その後 `http://localhost:8080/` を開きます。

## 注意

- OVATIONは約30分先の短時間予測です。数時間〜数日先の地理的オーロラ分布として使用しません。
- Kpは惑星規模の指数で、特定地点の可視性を単独では決めません。
- CME到達時刻やIMF Bzは不確実性があります。
- 観測地比較は道路、私有地、積雪、ヒグマ、災害、立入可否などの安全条件を評価しません。
- 通知はWebブラウザ/PWAのバックグラウンド制約を受けます。
- 撮影設定は開始値です。露出保証値ではありません。

## ファイル

- `index.html` UI
- `styles.css` UIスタイル
- `js/core.js` 数値計算・判定ロジック
- `js/data.js` NOAA / NASA / Open-Meteo通信
- `js/app.js` アプリ制御・描画・保存
- `sw.js` PWAキャッシュ
- `manifest.webmanifest` PWA manifest
- `assets/icon.svg` アイコン
- `test-core.mjs` コアロジック簡易テスト
