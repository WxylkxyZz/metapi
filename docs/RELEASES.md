# Canopy 发布（Releases）与 Docker 镜像说明

> 本文档对应仓库里的两个 GitHub Actions 工作流：
> - `.github/workflows/release.yml` —— 打 tag 时构建桌面包并发布 GitHub Release / 发布多架构 Docker 镜像
> - `.github/workflows/ci.yml` —— 每次 push 到 `main` 时自动发布 `latest` 镜像（可选开关）
>
> 涉及的产物：**桌面安装包**（Windows / macOS / Linux）与 **Docker 镜像**（amd64 + arm64，Docker Hub + GHCR）。

---

## 一、Docker 镜像发布方式

### 方案 A：打 tag，走 `release.yml`（正式版本）

1. 先准备好一个 tag（例如 `v1.1.0`），并推送到 GitHub：
   ```bash
   git tag v1.1.0
   git push origin v1.1.0
   ```
2. `release.yml` 自动触发，流水线依次：
   - **verify**：`npm test` + `npm run build`（编译产物）。
   - **build-packages**：在 4 个平台构建桌面安装包（Windows / mac-arm64 / mac-x64 / linux-x64）。
   - **publish-release**：把桌面包上传到对应 tag 的 GitHub Release，自动生成 release notes。
   - **publish-docker-arch**：为每个平台（amd64 / arm64）构建 `Dockerfile` 镜像并 `push`，tag 为 `<tag>-amd64` / `<tag>-arm64`（同时推到 Docker Hub 与 GHCR）。
   - **publish-docker**：把两个架构合并成多架构 manifest，打出 `<tag>` 与 `latest` 两个 tag。

   > 前提：仓库已配置 `DOCKERHUB_USERNAME`、`DOCKERHUB_TOKEN` 两个 secret（见下）。release.yml 的 docker 任务要求 tag 触发，且未配置该 secret 会直接失败退出。

   发布完成后，食用方式：
   ```bash
   docker pull <dockerhub_username>/canopy:latest     # 或 ghcr.io/<owner>/canopy:<tag>
   docker run -d --name canopy \
     -p 4000:4000 \
     -e AUTH_TOKEN=你的令牌 \
     -e PROXY_TOKEN=你的令牌 \
     <dockerhub_username>/canopy:latest
   ```

### 方案 B：push `main`，走 `ci.yml`（自动更新 latest，**可选**）

`ci.yml` 的 `publish-docker-arch` / `publish-docker` 受仓库**variable** `DOCKER_PUBLISH_ENABLED` 控制：

- 在仓库 **Settings → Variables** 添加 `DOCKER_PUBLISH_ENABLED = true`，并配置 `DOCKERHUB_USERNAME` / `DOCKERHUB_TOKEN` secrets。
- 之后每次 push `main` 都会构建并发布 `main-<sha>` / `latest` 多架构镜像。
- 未开启时，普通 push 的 CI 不会发布任何镜像。

> **二选一即可**：日常迭代用方案 B（latest 随时跟上），发布正式版用方案 A（tag 对应 release + 固定镜像版本）。两者共用一次 Docker 构建，互不冲突。

---

## 二、发布一个正式 Release 的手把手指引

### 1. 配置 secrets / variables（只在首次发布时做一次）

需要 **两个 secret + 一个 variable**：

| 类型 | 名称 | 值 |
| --- | --- | --- |
| Secret | `DOCKERHUB_USERNAME` | 你的 Docker Hub 用户名 |
| Secret | `DOCKERHUB_TOKEN` | Docker Hub 访问令牌（在 Docker Hub → Account Settings → Security 生成，勾读/写权限即可） |
| Variable | `DOCKER_PUBLISH_ENABLED` | `true`（方案 B 用；方案 A 仅发 release 的 tag 也可不开） |

环境检查：
```bash
gh variable list          # 确认 DOCKER_PUBLISH_ENABLED=true
gh secret list            # 确认 DOCKERHUB_USERNAME / DOCKERHUB_TOKEN 已配置
```

### 2. 本地更新版本号（`package.json`）并提交

把 `version` 改成新的语义版本，提交推送到 `main`（若需要发 `latest` 也得先过 CI）。

### 3. 打 tag 并推送

桌面 Release 包的版本取自 `package.json`，所以先确保 `package.json` / `package-lock.json` 的 `version` 已是目标版本（例如要把 `v1.1.0` 的桌面包发布成 1.1.0，就先 bump 到 1.1.0 并提交推送）；然后打 tag：

```bash
git tag v1.1.0
git push origin v1.1.0
```

到 Actions 页面查看 `Release` 工作流跑完（含 Verify / Desktop 打包 / GitHub Release / Docker）。

### 4. 在 GitHub Release 页检查产物

Release 页应包含桌面安装包（`.exe` / `.dmg` / `.AppImage` 等）资产；Docker 镜像则可 `docker pull` 验证。

---

## 三、常见问题与排查

### Q1：Release 工作流在"Build desktop artifacts"失败，报
```
Could not detect abi for version 42.0.1 and runtime electron.
```
**原因**：`electron-builder` 的 `@electron/rebuild` 依赖的 `node-abi` 版本不认识当前 electron 的 ABI（它内置到 `node-abi@4.26.0`，仅支持 Electron ≤ 40，而项目用 Electron 42）。这是依赖版本落后导致的构建失败。
**处理**：已在 `package.json` 通过 npm overrides 将 `@electron/rebuild` 的 `node-abi` 提升到 `^4.33.0`（支持 Electron 42，ABI 146）：
  ```json
  "overrides": {
    "@electron/rebuild": { "node-abi": "^4.33.0" }
  }
  ```
  已合入 `main`（968dc40）。重新 push 一个 tag 即可触发修复后的 release。

### Q2：我想要"只发 Docker，不发桌面包"
需要改 `release.yml`：让 `publish-docker-arch`/`publish-docker` 不再 `needs: build-packages`（改为直接依赖 `verify`），这样 Docker 发布不被桌面包构建阻塞。改动后重新打 tag 即可。

### Q3：`ci.yml` 的 docker job 在普通 push 直接跳过
正常 —— 未开启 `DOCKER_PUBLISH_ENABLED` 时不发布镜像，避免未配置密钥导致 push 红。参见上文方案 B。

### Q4：如何只发镜像不打 GitHub Release
- push `main`（方案 B）发 latest，不打任何 Release；
- 或打一个 tag 但仅让 release.yml 发 docker（若你需要保留 tag 语义）。