# Data Sources / Model Notes

## NOAA SWPC
- OVATION Aurora latest: `/json/ovation_aurora_latest.json`
- Planetary K-index: `/products/noaa-planetary-k-index.json`
- Planetary K-index forecast: `/products/noaa-planetary-k-index-forecast.json`
- Kyoto Dst: `/products/kyoto-dst.json`
- Solar-wind speed summary: `/products/summary/solar-wind-speed.json`
- Solar-wind magnetic field summary: `/products/summary/solar-wind-mag-field.json`

## Low-latitude geometry (prototype)
観測地点と同じ半球で、観測地点より極側かつ近い経度帯のOVATIONセルを探索します。発光高度を250 kmに固定し、球形地球（半径6371 km）上で見かけ高度を計算します。

これは「見通せる幾何条件」の試算であり、赤色630.0 nm発光の高度分布、磁力線構造、サブストーム局所性、大気減光、雲、光害、地形遮蔽はまだ完全には扱っていません。

## Future calibration
低緯度オーロラの過去事例について、時刻・位置・Dst・Kp・Bz・太陽風・OVATION・撮影/肉眼報告を検証データセット化し、Nicole INDEXを校正する予定です。
