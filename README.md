# EBC 三垭口大环线路线规划器

基于 KML 轨迹制作的 EBC 三垭口 8–13 天交互式路线规划网站，支持查看每日距离、爬升、下降、海拔剖面、住宿信息，以及 Gokyo Ri 和第五湖支线。

## 本地运行

```bash
cd site
npm install
npm run dev
```

打开 <http://localhost:3000/>。

## GitHub Pages

推送到 `main` 分支后，仓库内的 GitHub Actions 会构建并发布静态网站。在仓库 **Settings → Pages** 中将 Source 设为 **GitHub Actions**。

> 高海拔徒步存在高反、冰雪垭口、迷路和突发天气风险。本网站仅用于路线参考，不能替代向导、当地信息和现场判断。
