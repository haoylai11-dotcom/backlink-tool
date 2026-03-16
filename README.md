# 🔗 Backlink Comment Tool

自动化博客评论外链系统 — 从 Semrush 抓取反链数据，检测可评论站点，AI 生成评论，自动发布。

## 安装

1. 下载整个 `backlink-tool` 文件夹到本地
2. 打开 Chrome，访问 `chrome://extensions/`
3. 右上角开启 **开发者模式**
4. 点击 **加载已解压的扩展程序**，选择 `backlink-tool` 文件夹
5. 插件图标会出现在浏览器右上角

## 使用流程

### 第一步：配置设置
1. 点击插件图标，进入 **Settings** 标签
2. 填写 LLM API 信息（支持 OpenAI 兼容格式的任何 API）：
   - API Endpoint: `https://api.openai.com/v1`（或其他兼容端点）
   - API Key: 你的 API 密钥
   - Model: `gpt-4o-mini`（推荐，便宜够用）
3. 填写评论身份信息：
   - Name: 评论显示的名字
   - Email: 评论用的邮箱
   - Website: 你要推广的网站（如 `https://basketball-stars.io`）
4. 点击 **Save Settings**

### 第二步：抓取 Semrush 反链
1. 登录 Semrush（需要付费账号）
2. 进入 **Backlink Analytics** → 输入目标域名（如 `basketball-stars.io`）→ 查看反链列表
3. 在反链列表页面，点击插件图标
4. 在 Dashboard 的输入框输入域名，点击 **Scrape**
5. 插件会自动翻页抓取所有反链数据（Authority Score < 10 的会被自动过滤）
6. 等待 "Scraping complete" 出现在日志中

### 第三步：检测可评论站点
1. 点击 **Detect Comments** 按钮
2. 插件会逐个打开反链页面（后台标签页），检测：
   - 是否有评论表单
   - 是否有 Website/URL 输入框
   - 是否需要登录
   - 是否有验证码
   - 同时抓取评论区里其他人留的网站 URL（作为新种子）
3. 每个页面检测间隔 3-8 秒，模拟真人
4. 完成后在 **Backlinks** 标签可以按状态筛选

### 第四步：AI 生成评论
1. 点击 **Generate AI** 按钮
2. 插件会为所有 `commentable` 的页面调用 LLM 生成相关评论
3. 评论会根据文章内容定制，自然地提到你的网站
4. 生成的评论可以在 **Comments** 标签查看

### 第五步：发布评论
1. 点击 **Post All** 按钮
2. 插件会逐个打开页面，自动填写并提交评论
3. 发布间隔 5-15 秒，模拟人类操作
4. 遇到验证码会暂停，需要手动处理
5. 发布结果会记录在 **Comments** 标签

## 递归挖掘

在检测阶段，插件会从评论区发现其他站长的网站 URL。这些 "discovered sites" 可以作为新的种子域名，回到 Semrush 查它们的反链，重复整个流程。Dashboard 显示发现的站点数量。

## 数据管理

- **Export Data**: 导出所有数据为 JSON 文件
- **Clear All Data**: 清空所有数据（不可恢复）
- 所有数据存储在浏览器本地 IndexedDB 中

## 注意事项

⚠️ **需要 Semrush 付费账号** — 插件不能绕过 Semrush 的付费墙  
⚠️ **评论质量** — AI 生成的评论建议人工检查后再发布  
⚠️ **频率控制** — 不要把延迟设太低，避免被目标网站封 IP  
⚠️ **验证码** — 遇到 reCAPTCHA 需要手动处理  
⚠️ **合规性** — 请遵守目标网站的使用条款
