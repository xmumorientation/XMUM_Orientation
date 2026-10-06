# David Next Tasks

Last updated: 2026-10-06

## 1. 把 `bonding-session` 的功能搬进现在的 code

不直接 merge，在最新的 main 上一块块重做。

- [ ] Day 1 GM results（PK / 单组，奖励从 config 拿）
- [ ] Day 2 station attempts（付 token 入场，赢了拿 puzzle piece）
- [ ] Token ledger（每笔都有记录，改错加新的一笔）
- [ ] Puzzle 管理（Admin 看哪组有哪块，可以改）
- [ ] Blind box（QR 只能扫一次，开箱拿 token）
- [ ] NFC puzzle redemption（Lighting Zones）
- [ ] Inventory 分 Token / Puzzle / Blind Box，live update
- [ ] Admin：GM 站点分配、game config、Timer
- [ ] Role permissions + `/forbidden`

Notes:
- Freshie 要能登录，不搬 "Freshie 没 account" 那套。
- Migration 不用 `0015` 到 `0030`。
- 角色用哪一套先跟 Ben 确认。
- Ben 的 `/inventory` 页等这里的数据接上。

## 2. UI/UX 再改进

- [ ] 手机上走一遍 Welcome、login、Check-in、Freshie Home、Faci Home
- [ ] 记下要改的地方，改之前先在 group 讲一声
