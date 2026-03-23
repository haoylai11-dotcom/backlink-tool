# 🔗 Backlink Comment Tool

自动化博客评论外链系统 — 通过 Ahrefs API 获取反链数据，检测可评论站点，AI 生成评论，自动发布。

## 安装

1. 下载整个 `backlink-tool` 文件夹到本地
2. 打开 Chrome，访问 `chrome://extensions/`
3. 右上角开启 **开发者模式**
4. 点击 **加载已解压的扩展程序**，选择 `backlink-tool` 文件夹

## 使用流程

### 第一步：配置设置
1. 点击插件图标，进入 **Settings** 标签
2. 填写 **Ahrefs API Key**
3. 设置 **Min Domain Rating**（默认 10，过滤低质量站点）
4. （可选）填写 LLM API 信息用于生成评论
5. 填写评论身份信息（Name、Email、Website）
6. 点击 **Save Settings**

### 第二步：获取反链数据
1. 在 Dashboard 输入目标域名（如 `basketball-stars.io`）
2. 点击 **Scrape**
3. 插件通过 Ahrefs API 自动获取所有反链（按 Domain Rating 降序）
4. 数据会显示在 **Backlinks** 标签

### 第三步：检测可评论站点
1. 点击 **Detect Comments**
2. 插件逐个打开反链页面检测评论功能
3. 检测完成后可在 **Backlinks** 标签按状态筛选

### 第四步：AI 生成评论
1. 点击 **Generate AI**（需要先配置 LLM API）
2. 为所有可评论页面生成定制评论

### 第五步：发布评论
1. 点击 **Post All**
2. 插件自动填写并提交评论

## 注意事项

⚠️ **需要 Ahrefs API key**（付费）
⚠️ 评论发布建议先人工检查
⚠️ 注意频率控制，避免被封 IP
