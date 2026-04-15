# Proof of Vault 二号位实现清单

这份清单基于当前已落地的合约实现，目标是帮助二号位把 `Onchain OS + 后端编排 + 前端联调` 一次性接通，不需要重新猜链上接口。

## 1. 你的职责边界

你负责：

- 链下 orchestrator
- Agentic Wallet 接入
- Onchain OS Skills / Open API 数据接入
- payload 生成、存储、哈希
- committee 选人和任务分发
- 前端和 API 的状态同步

你不负责：

- 修改合约状态机
- 修改链上角色和 slash 规则
- 在链上实现完整 reputation 逻辑

## 2. 你必须接的角色

### Setter 侧

前端或 API 需要支持：

- `createVaultRequest`
- `acceptRuleSetAndFund`
- `rejectRuleSet`

兼容 fallback：

- `createVaultAndDeposit`

### Agent 侧

Agentic Wallet 必须支持：

- `stakeForAgent`
- `submitRuleDraft`
- `submitRuleIssue`
- `commitResolution`
- `revealResolution`
- `submitAuditVerdict`
- `openPublicChallenge`
- `claimRewards`

### Orchestrator 侧

服务端必须能调用：

- `registerRuleCommittee`
- `finalizeRuleSet`
- `registerResolutionCommittee`

### Finalizer 侧

服务端或 ops wallet 必须能调用：

- `resolveChallenge`
- `finalizeV2Vault`

兼容 fallback：

- `finalizeVault`

## 3. 你必须维护的链下状态

- agent capability tags
- agent reputation
- committee 抽样结果
- rule round / resolution round 的任务状态
- payload URI 与 hash 的对应关系
- challenge 证据包
- Market Skills / Open API 读取的数据快照

当前 reputation 不上链，所以这部分必须由你维护。

## 4. 你必须产出的 payload

每种 payload 都要满足两个要求：

- 生成 canonical JSON
- 链上只提交 `hash + URI`

### `rule draft payload`

至少包含：

- `vaultId`
- `round`
- `template`
- `statement`
- `inputs`
- `sources`
- `version`

### `rule issue payload`

至少包含：

- `vaultId`
- `round`
- `severity`
- `issueType`
- `notes`
- `version`

### `criteria final payload`

至少包含：

- `vaultId`
- `round`
- `criteriaHash`
- `approvedDrafts`
- `acceptedIssues`
- `finalSourcePolicy`
- `version`

### `resolution reveal payload`

至少包含：

- `vaultId`
- `round`
- `result`
- `confidenceScore`
- `sources`
- `reasoning`
- `submittedByAgent`
- `version`

### `audit verdict payload`

至少包含：

- `vaultId`
- `round`
- `validator`
- `verdict`
- `findings`
- `reviewerAgent`
- `version`

### `public challenge payload`

至少包含：

- `vaultId`
- `round`
- `target`
- `targetRole`
- `reason`
- `evidence`
- `challenger`
- `version`

## 5. Hash 规范

你现在就要固定一套 hash 规范，不然后面很容易出现：

- 前端展示内容和链上 hash 对不上
- reveal proof 和 audit verdict 互相验证不了
- challenge 无法稳定引用目标 payload

推荐规则：

- JSON key 固定顺序
- 地址统一小写
- 数值统一字符串
- 枚举统一大写字符串
- UTF-8 bytes 做 `keccak256`

## 6. 状态机映射

前端和 API 至少要识别这些状态：

- `RuleAuction`
- `RuleDrafting`
- `UserRuleReview`
- `Active`
- `ResolutionAuction`
- `CommitPhase`
- `RevealPhase`
- `AuditPhase`
- `PublicChallenge`
- `ResolvedTrue`
- `ResolvedFalse`
- `ResolvedInvalid`
- `Cancelled`

不要只按 legacy 的 `Active / Resolving / Resolved` 去写页面，否则 V2 页面会错。

## 7. Rule 阶段你要做什么

### 7.1 创建 request 后

当 setter 发起 `createVaultRequest` 后：

- 读取 vault 基础信息
- 解析自然语言 statement
- 生成结构化任务
- 做 agent eligibility filtering
- 抽出 maker 和 verifier
- 调 `registerRuleCommittee`

### 7.2 Rule drafting

你要让 agent wallet 或 agent runtime：

- maker 提交 `submitRuleDraft`
- verifier 提交 `submitRuleIssue`

并且在链下保存：

- payload JSON
- payload URI
- hash
- agent explanation

### 7.3 Rule finalize

你要根据链下结果整理：

- `approvedMakers`
- `acceptedVerifiers`
- `maliciousMakers`
- `maliciousVerifiers`

然后调 `finalizeRuleSet`。

这里的重点是：

- 不能把没提交 draft 的 maker 放进 `approvedMakers`
- 不能把没提交 issue 的 verifier 放进 `acceptedVerifiers`
- 因为合约已经做了校验，乱传会 revert

### 7.4 Setter review

setter 在页面上必须能看到：

- 最终 criteria 摘要
- 被采纳的 issue
- 可接受或拒绝

对应链上动作：

- 接受：`acceptRuleSetAndFund`
- 拒绝：`rejectRuleSet`

## 8. Resolution 阶段你要做什么

### 8.1 注册 resolution committee

在 settlement 时间到后：

- 重新做 eligibility filtering
- 抽出 validator 和 auditor
- 计算 `minValidCount`
- 调 `registerResolutionCommittee`

默认 hackathon 版本建议：

- `3 validators`
- `2 auditors`
- `minValidCount = 2`

### 8.2 Validator commit

validator 先提交：

- `commitHash = keccak256(outcome, proofHash, salt, validator, vaultId, round)`

链上调用：

- `commitResolution`

### 8.3 Validator reveal

之后 reveal：

- `outcome`
- `proofHash`
- `salt`
- `payloadURI`

链上调用：

- `revealResolution`

注意：

- reveal 不匹配 commit 会被链上直接判为 `disqualified`
- 后续这是硬性 slash 候选

### 8.4 Auditor review

每个 auditor 必须对每个已 reveal 的 validator 做 verdict。

链上调用：

- `submitAuditVerdict`

如果 auditor 没覆盖完所有 reveal：

- 现在合约会把他当成 `NonParticipation`
- 可能直接 slash 剩余 task bond

所以前端和任务系统必须明确显示：

- 当前 auditor 还缺哪些 validator 没 review

### 8.5 Public challenge

进入 `PublicChallenge` 后，可挑战角色是：

- 已 stake 且不在当前 resolution committee 内的 agent
- setter
- safety council

当前 committee 成员不能普通身份发 challenge。

调用：

- `openPublicChallenge`

并且要先准备好：

- `challenge payload`
- `challenge hash`
- `challenge bond`

### 8.6 Finalize

finalizer 在所有 challenge 处理完后：

- 成功 challenge 就先调 `resolveChallenge(..., successful=true, ...)`
- 失败 challenge 就调 `resolveChallenge(..., successful=false, ...)`
- 最后调 `finalizeV2Vault`

## 9. Rewards 和前端展示

你要把 reward 展示做出来，因为这正是 agent 参与工作的激励证明。

前端至少展示：

- setup deposit 余额
- resolution reward deposit 余额
- challenge bond 余额
- 当前 agent claimable rewards

用户操作：

- `claimRewards`

### 奖励逻辑理解

- Rule maker：基础奖励 + 被采纳 bonus
- Rule verifier：只奖励被采纳 issue，按 severity 分层
- Validator：
  - `Valid + final outcome 一致`：base + quality + consensus
  - `Valid + minority`：base + quality
  - `Questionable`：仅部分奖励
  - `Invalid / Malicious`：无奖励
- Auditor：
  - 完整覆盖审计后拿 base
  - 如果识别出高价值问题，再拿高价值奖励
- Challenger：
  - challenge 成功可获奖励
  - challenge 失败会损失一部分 challenge bond

## 10. 你必须索引的事件

前端和 API 必须索引：

- `VaultRequestCreated`
- `RuleCommitteeRegistered`
- `RuleDraftSubmitted`
- `RuleIssueSubmitted`
- `RuleSetFinalized`
- `RuleSetRejected`
- `RuleSetAccepted`
- `ResolutionCommitteeRegistered`
- `ResolutionCommitted`
- `ResolutionRevealed`
- `AuditVerdictSubmitted`
- `PublicChallengeOpened`
- `PublicChallengeResolved`
- `ResolutionRoundReopened`
- `VaultFinalized`
- `TaskBondLocked`
- `TaskBondReleased`
- `TaskBondSlashed`
- `RewardClaimed`

如果你漏了 `ResolutionRoundReopened`，页面会在补充轮时直接断状态。

## 11. Onchain OS 接入点

### Agentic Wallet

建议用在这些真实链上动作：

- agent stake
- commit
- reveal
- audit verdict
- public challenge
- claim rewards

### Market Skills / Open API

建议用在这些链下动作：

- 拉 token price / FDV / 市场数据
- 构造 resolution reveal payload
- 构造 audit verdict payload
- 补充 challenge evidence

### Demo 最佳叙事

1. setter 创建 vault request
2. agents 定规则
3. setter 接受规则并上链 funding
4. validator agent 用 Agentic Wallet commit + reveal
5. auditor agent 提交 verdict
6. finalizer 完成结算
7. validator / auditor claim rewards

这样最能体现：

- agent 有钱包
- agent 真的在 X Layer 上执行协议动作
- Onchain OS 不是装饰，而是主流程的一部分

## 12. 你需要先做的联调顺序

建议按这个顺序：

1. 读 `getVault`
2. 打通 `createVaultRequest`
3. 打通 `registerRuleCommittee`
4. 打通 `submitRuleDraft / submitRuleIssue`
5. 打通 `finalizeRuleSet`
6. 打通 `acceptRuleSetAndFund`
7. 打通 `registerResolutionCommittee`
8. 打通 `commitResolution`
9. 打通 `revealResolution`
10. 打通 `submitAuditVerdict`
11. 打通 `openPublicChallenge`
12. 打通 `resolveChallenge / finalizeV2Vault`
13. 打通 `claimRewards`

## 13. 当前最容易踩坑的点

- 忘记按 canonical JSON 算 hash
- 把当前 committee 成员也允许去 public challenge
- auditor 没覆盖所有 reveal，结果被链上按非参与 slash
- 把 `Questionable` 当成 `Invalid`
- 忽略 `ResolutionRoundReopened`
- 忽略 `ResolvedInvalid` 的正常业务含义
- reward deposit 不够时没有前端提示

## 14. 你现在可以直接拿去做的最小验收

你至少要能演示这 4 笔由 agent wallet 发出的交易：

1. `stakeForAgent`
2. `commitResolution`
3. `revealResolution`
4. `claimRewards`

再加上：

- setter 的 `createVaultRequest`
- setter 的 `acceptRuleSetAndFund`
- finalizer 的 `finalizeV2Vault`

这样 demo 就已经满足：

- X Layer 上有真实链上痕迹
- Onchain OS 真正参与主流程
- agent 不是只读数据，而是实际工作和结算
