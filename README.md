# Nicole the Auroragazer v0.1.0 Prototype

Nicoleシリーズの「ニコル3」。公的な宇宙天気データと観測地点を組み合わせ、通常のオーロラ帯と低緯度オーロラの観測可能性を支援する試作版です。

## v0.1.0 の範囲
- GPS / 緯度経度手入力（南半球対応）
- NOAA SWPC OVATION Aurora latest
- NOAA Planetary K-index / K-index forecast
- NOAA Kyoto Dst
- NOAA real-time solar-wind summary
- 位置×宇宙天気のNicole独自INDEX（段階評価）
- 低緯度オーロラ候補：OVATIONの極側強度を探索し、高度250 kmを仮定した地平線上の見かけ高度を試算
- 肉眼 / カメラの見え方目安
- PWAアプリシェルと最終取得データのローカル保存

## 重要
Nicole INDEXは出現確率ではありません。低緯度オーロラの予測には大きな不確実性があります。v0.1.0は研究・観測支援向けの試験モデルです。

## 次段階候補
1. NASA DONKI / WSA-EnlilによるCME到来予測
2. NICT宇宙天気予報の日本向け補助情報
3. 雲量・月明かり・太陽高度・薄明・光害
4. 地図上のOVATION表示と地点タップ予測
5. 過去の低緯度オーロラ事例によるモデル校正
6. 地磁気座標 / AACGM系の導入
7. 通知（条件を満たしたら観測候補を通知）

## 公的データ
- NOAA SWPC: https://services.swpc.noaa.gov/
- NASA DONKI: https://api.nasa.gov/
- NICT 宇宙天気予報: https://swc.nict.go.jp/

## 起動
静的HTTPサーバーまたはGitHub Pages上で開いてください。PWA / Geolocation / Service Workerのため、`file://` 直開きではなく `https://` または localhost を推奨します。
