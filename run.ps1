# Polymarket LLM Bot - 项目初始化脚本
# 使用方法：在 PowerShell 中运行 .\init-project.ps1

Write-Host "🚀 开始初始化 Polymarket LLM Bot 项目..." -ForegroundColor Green

# 创建根目录
$projectRoot = "pmbot"
if (Test-Path $projectRoot) {
    Write-Host "⚠️  目录 $projectRoot 已存在，将覆盖现有文件" -ForegroundColor Yellow
}
New-Item -ItemType Directory -Force -Path $projectRoot | Out-Null
Set-Location $projectRoot

# 创建目录结构
$directories = @(
    ".github/workflows",
    "cypress/e2e",
    "src/components/ui",
    "src/components/layout",
    "src/components/dashboard",
    "src/components/charts",
    "src/components/settings",
    "src/components/activity",
    "src/services/api",
    "src/services/strategies",
    "src/services/strategies/__tests__",
    "src/services/trading",
    "src/services/llm",
    "src/services/realtime",
    "src/services/wallet",
    "src/stores",
    "src/hooks",
    "src/types",
    "src/utils",
    "src/test",
    "public"
)

foreach ($dir in $directories) {
    New-Item -ItemType Directory -Force -Path $dir | Out-Null
    Write-Host "✅ 创建目录：$dir" -ForegroundColor Gray
}

# 创建文件列表
$files = @{
    "package.json" = $packageJson;
    "tsconfig.json" = $tsconfig;
    "tsconfig.node.json" = $tsconfigNode;
    "vite.config.ts" = $viteConfig;
    "tailwind.config.js" = $tailwindConfig;
    "postcss.config.js" = $postcssConfig;
    "cypress.config.ts" = $cypressConfig;
    "vitest.config.ts" = $vitestConfig;
    "netlify.toml" = $netlifyToml;
    "index.html" = $indexHtml;
    ".env.example" = $envExample;
    ".gitignore" = $gitignore;
    "src/main.tsx" = $mainTsx;
    "src/App.tsx" = $appTsx;
    "src/index.css" = $indexCss;
    "src/vite-env.d.ts" = $viteEnv;
    # ... 更多文件
}

Write-Host "`n📁 项目结构创建完成！" -ForegroundColor Green
Write-Host "`n下一步：" -ForegroundColor Cyan
Write-Host "1. cd $projectRoot" -ForegroundColor White
Write-Host "2. npm install" -ForegroundColor White
Write-Host "3. cp .env.example .env.local" -ForegroundColor White
Write-Host "4. 编辑 .env.local 填入 API 密钥" -ForegroundColor White
Write-Host "5. npm run dev" -ForegroundColor White