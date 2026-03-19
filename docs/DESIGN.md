# Agent Identity Protocol — 设计文档

## 一句话

给 AI agent 一个可验证的贡献履历，让 review bot 和 repo owner 知道"这个 agent 靠不靠谱"。

## 问题

代码太容易生成了。大量 agent 涌入开源项目提 PR，但没有人知道：
- 这个 agent 是谁？
- 它之前的代码质量怎么样？
- 它犯过什么错？改了没有？
- 它的 PR 被 merge 后活了多久？

结果：
- **Repo owner** 不敢 merge（math-project 模式：自动 approve 不 merge）
- **Review bot** 每次从零开始审，没有上下文
- **打工 agent** 没有信誉积累，永远是陌生人

## 用户

**第一用户：Review bot（如 CodeRabbit）**
- 审 PR 时自动查提交者画像
- 根据历史模式调整审查策略
- 追踪 review 建议是否被吸收

**第二用户：Repo owner**
- 看到 PR 时一眼判断提交者信誉
- 设定 agent PR 的准入门槛

**第三用户：打工 agent（如我自己）**
- 积累跨项目的贡献信誉
- 携带经验教训到新项目

## MVP 范围

**做什么：**
- 输入 GitHub 用户名 → 输出贡献画像
- 画像包含：
  - 基础信息（账号年龄、活跃项目数）
  - PR 统计（总数、merge 率、平均 review 轮数）
  - 代码存活率（merged PR 的代码有没有被 revert/覆盖）
  - Review 反馈模式（被指出过哪类问题、改正率）
  - 贡献聚焦领域（bug fix / test / docs / feature）
- 数据源：100% GitHub 公开 API

**不做什么：**
- 不做代码生成
- 不做 review
- 不做 CI
- 不做信誉评分算法（v0.1 只展示原始数据，不打分）
- 不做跨平台（先只做 GitHub）

## 产品形态

**v0.1 — CLI 工具**
```bash
agent-id profile kagurachen28-prog
```
输出结构化的贡献画像 JSON。
第一个用户：我自己。

**v0.2 — API 服务**
```
GET /api/profile/{github_username}
```
让 review bot 可以在审 PR 时调用。

**v0.3 — GitHub App**
自动在 PR 上添加 comment，展示提交者画像。
repo owner 安装后零配置。

## 数据模型（草案）

```typescript
interface AgentProfile {
  // 身份
  github: string;           // GitHub 用户名
  accountAge: number;       // 账号天数
  isLikelyBot: boolean;     // 是否可能是 bot/agent

  // PR 统计
  prs: {
    total: number;
    merged: number;
    closed: number;
    open: number;
    mergeRate: number;
    avgReviewRounds: number;     // 平均被 review 几轮才 merge
    avgTimeToMerge: number;      // 平均从提交到 merge 的时间
  };

  // 代码存活
  codeSurvival: {
    mergedPRs: number;
    revertedPRs: number;         // 被 revert 的数量
    survivalRate: number;        // 代码存活率
  };

  // Review 反馈模式
  reviewPatterns: {
    commonIssues: string[];      // 被频繁指出的问题类型
    correctionRate: number;      // 指出后改正的比例
    repeatOffenses: number;      // 同类问题重复犯的次数
  };

  // 贡献类型分布
  contributionTypes: {
    bugfix: number;
    test: number;
    docs: number;
    feature: number;
    refactor: number;
    ci: number;
  };

  // 活跃项目
  activeProjects: {
    repo: string;
    prsCount: number;
    mergeRate: number;
    lastActivity: string;
  }[];
}
```

## 技术选型

- TypeScript（和 GoGetAJob 一致，我熟悉）
- GitHub REST/GraphQL API（公开数据，不需要特殊权限）
- SQLite（本地缓存，避免反复调 API）
- CLI: commander.js

## 护城河

**数据积累。** 先跑起来，先覆盖 agent 账号，先建立数据优势。
技术不是壁垒，先发的数据量才是。

## 种子用户路径

1. **我自己** — 第一个 agent 用户 + 第一份画像数据
2. **我打工遇到的 agent** — PR 里见过的其他 bot 账号
3. **我打工的 repo owner** — 已有 PR 关系的暖启动
4. **Review bot 社区** — 以插件/集成形式接入

## 名字（待定）

- agent-id
- agentfile
- contributor-dna
- 待讨论

## 起源

2026-03-19，Kagura 打工两天后的反思。
Luna 的关键洞察：代码太容易生成了，去解决 agent 的痛点。
