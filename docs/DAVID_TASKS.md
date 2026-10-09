# David 任务清单

更新：2026-10-06

## 已完成

- [x] Welcome page 改成从太空一路下降到 theme park 的背景，补上火箭、星球、飞机、直升机、云和地面装饰。
- [x] 调整 Welcome、Check-in 和 Scoreboard 的文案，统一用 wristband ticket。
- [x] 更新 Vortexa 网站图标，整理 Freshie 和工作人员登录页的字体、间距和返回按钮。
- [x] 重做 Freshie dashboard，加入组别颜色、schedule preview、地图入口、token balance 和常用按钮。
- [x] 统一 FACI、GM、Committee 和 Admin dashboard 的风格。保留 FACI 的组名、人数和位置 checklist。
- [x] 调整 Admin 页面和 Groups 手机布局，把手机上的横向表格改成逐组卡片。
- [x] 菜单改为从顶部展开，关闭按钮放右边，菜单外的背景加深。
- [x] Items 保留原本的视觉和动画，统一字体，调整 Activity 和游戏时间的显示。
- [x] Schedule 保留新的标题字体，其余恢复原本的卡片和时间线。
- [x] 减少 Admin Token 页的重复请求，补上同步和页面加载提示。
- [x] 通过 TypeScript、lint 检查，检查 dashboard 在 320、393、768 和 1280px 下没有横向溢出。
- [x] 这轮界面改动已提交到本地 main：`8567151`。

## 接下来先做

- [x] 检查活动名称改字和这份任务清单，纳入这次提交。
- [ ] 在手机上完整走一遍 Welcome、两种 login、Freshie Home、FACI Home、Items 和 Schedule。
- [ ] 用 GM、Committee 和 Admin 账号分别检查 dashboard、菜单和常用入口。当前主要看过 Admin 预览。
- [ ] 在真实手机上检查点击、页面切换和滚动速度。后台请求已减少，实际手感还要再试。
- [ ] 检查 Admin 的 phase、开关、组数、颜色和 QR 操作。界面已改过，这轮没有实际执行管理操作。
- [ ] 确认正式 sponsor logo，替换现在的示例。

## 把 bonding-session 的功能搬进来

先跟 Ben 确认角色和数据结构，再逐项对照分支。现在已有一些相关页面和 RPC，但还不能算这些功能全部搬完。

- [ ] Day 1 GM results：记录单组或 PK 结果，确认奖励、重复提交和通知。
- [ ] Day 2 station attempts：付 token 入场，GM 记录输赢，赢了拿未拥有的 puzzle piece。
- [ ] Token ledger：每笔收支都保留，改错新增一笔更正记录，reset 后也保留历史。
- [ ] Puzzle 管理：Admin 能看各组拿了哪些 piece、修正错误；同一块不能重复领取。
- [ ] Blind box：QR 只能领取一次，开箱结果写进记录；实际扫码和开箱要测试。
- [ ] NFC puzzle redemption：接上 Lighting Zones 的单次领取、记录和撤销流程。
- [ ] Inventory：把 Ben 的 Items 页接上真实 Token、Puzzle、Blind Box 数据和实时更新。现在仍是 sample data。
- [ ] Admin：补齐 FACI 组别分配、GM 每日站点分配、game config 和 Timer。
- [ ] Role permissions：对照页面、API、RPC 和数据库权限，逐个角色测试。

搬代码时注意：

- 保留 Freshie 登录，也保留 wristband ticket QR 直接进入组别页面的流程。
- 不搬「Freshie 没有 account」那套做法。
- Committee、HOF、HOGM 和 Guardian GM 要用哪套角色，先跟 Ben 确认。
- 不直接 merge 整个 bonding-session；按功能搬，保留现在的界面。
- 不重用 migration 编号 `0015` 到 `0030`，新 migration 先检查现有编号。
- Inventory 的实时数据、扫码和 NFC 接好后，再一起走一遍完整游戏流程。

## 后面再确认

- [ ] 组头像是否由 FACI 上传，以及要不要显示在其他组看得到的页面。现在只有想法，还没做上传。
- [ ] 继续改 UI 前，在 group 讲一下要改哪一部分，避免大家同时改同一个地方。
