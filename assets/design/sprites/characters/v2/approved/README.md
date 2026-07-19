# V2 Wheelbase Approved Animation Baseline

批准锁按不可变父级逐步扩展：

- `v2-wheelbase-animation-baseline-lock-v1.json`：moving、researching、executing。
- `v2-wheelbase-animation-baseline-lock-v2.json`：在 v1 基础上增加 writing，共锁定 287 个文件。
- `v2-wheelbase-animation-baseline-lock-v3.json`：在 v2 基础上增加 syncing，共锁定 358 个文件。
- `v2-wheelbase-animation-baseline-lock-v4.json`：在 v3 基础上增加 error，共锁定 429 个文件。

每份锁都记录角色尺寸契约、批准证据和正式文件 SHA-256；父级锁中的文件和哈希
不得被后续状态覆盖。后续新状态必须使用新的候选 metadata，并在明确视觉确认后
建立新的锁版本。
