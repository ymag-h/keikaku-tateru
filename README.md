# keikaku-tateru
仕事で使うツール
忘備録用

### bootstrap 実行
```bash
npm run bootstrap
```

## ディレクトリ構造

```
keikaku-qc/
├── input/                    ← 手元の入力ファイル
│   └── air_bins.txt
├── scripts/
│   └── bootstrap-from-xlsx.ts  ← 現 Phase のメイン
├── src/
│   └── types.ts              ← 共通型定義
├── config/                   ← 実行後に自動生成
│   ├── members.json
│   ├── routines.json
│   ├── air_bins.json
│   └── shifts/shift_YYYY-MM.json
└── package.json
```

## 次の予定

- ② SettingsDialog (React) — config を UI で編集
- ③ CSV import (Andon / SIM)
- ④ PlanMaster tab (View/Edit)
- ⑤ Dashboard tab
- ⑥ Slack 画像共有 + xlsx エクスポート

