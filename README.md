# keikaku-qc

NRT5/HND2 QC チーム向け 計画実績アプリ

## 現在の Phase

**Phase ①: xlsxImport** (既存.xlsx → config JSON 4本)

## セットアップ

### 1. 依存インストール
VSCode ターミナル (Ctrl+@) で:
```bash
npm install
```

### 2. 入力ファイルの準備

- `input/qa_plan.xlsx` ← 既存の `【NRT5_HND2】QA計画実績.xlsx` (コピー済)
- `input/air_bins.txt` ← Air 対象 Bin ID を改行区切りで追記

### 3. bootstrap 実行
```bash
npm run bootstrap
```

## ディレクトリ構造

```
keikaku-qc/
├── input/                    ← 手元の入力ファイル
│   ├── qa_plan.xlsx
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

## 次の Phase 予定

- ② SettingsDialog (React) — config を UI で編集
- ③ CSV import (Andon / SIM)
- ④ PlanMaster tab (View/Edit)
- ⑤ Dashboard tab
- ⑥ Slack 画像共有 + xlsx エクスポート

