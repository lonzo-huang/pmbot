目录	路径	文件/目录类型	主要模块/函数	作用说明	依赖关系	备注
根目录	.env.example	配置文件		环境变量示例模板	无	用于复制创建 .env.local
根目录	.env.local	配置文件		本地环境变量（不提交到仓库）	无	存储 API Keys、数据库连接等敏感信息
根目录	.gitignore	配置文件		定义 Git 忽略的文件/目录规则	无	排除 node_modules、.env、构建产物等
根目录	cypress.config.ts	配置文件	defineConfig()	Cypress E2E 测试框架配置	cypress	配置测试服务器、浏览器等
根目录	index.html	HTML 文件		应用入口 HTML 文件	Vite	"包含 <div id=root""> 和脚本引用"""
根目录	MIT.license	许可证文件		开源许可证声明	无	定义项目使用条款
根目录	package.json	配置文件	"scripts, dependencies, devDependencies"	项目元数据和依赖管理	npm/yarn	定义构建命令、依赖包版本
根目录	package-lock.json	锁定文件		精确锁定依赖包版本	npm	确保团队依赖一致性
根目录	postcss.config.js	配置文件	"plugins: [tailwindcss, autoprefixer]"	PostCSS 配置（用于 Tailwind）	"postcss, tailwindcss"	CSS 预处理配置
根目录	README.md	文档文件		项目说明文档	无	包含安装、使用、贡献指南
根目录	run.ps1	PowerShell 脚本	"Start-Process, npm run dev"	Windows 一键启动脚本	PowerShell	简化开发流程
根目录	tailwind.config.js	配置文件	"content, theme, plugins"	Tailwind CSS 配置	tailwindcss	定义设计系统、自定义类
根目录	tsconfig.json	配置文件	"compilerOptions: target, module, paths"	TypeScript 编译器配置	TypeScript	定义类型检查规则、路径别名
根目录	tsconfig.node.json	配置文件		Node 环境 TypeScript 配置	TypeScript	用于 Vite 配置文件的类型检查
根目录	vite.config.ts	配置文件	"defineConfig, plugins, resolve.alias, server.proxy"	Vite 构建工具配置	"vite, @vitejs/plugin-react"	配置开发服务器、代理、构建优化
根目录	vitest.config.ts	配置文件		Vitest 单元测试框架配置	vitest	配置测试环境、覆盖率等
根目录	deploy.yaml	GitHub Actions	"jobs: build, test, deploy"	CI/CD 自动化部署流程	GitHub Actions	代码推送后自动构建测试部署
.idea	*.xml	IDE 配置文件		WebStorm/IntelliJ IDEA 项目配置	IDE	代码风格、运行配置、版本控制设置
cypress	cypress/e2e/trading.cy.ts	E2E 测试文件	"describe, it, cy.visit, cy.get"	端到端交易流程测试	"cypress, @testing-library"	模拟用户完整交易操作
cypress	cypress/support/e2e.ts	测试支持文件	"beforeEach, commands"	测试通用配置和自定义命令	cypress	设置测试前准备、自定义 cy 命令
	favicon.svg	静态资源		网站图标	浏览器	浏览器标签页图标
public	vite.svg	静态资源		Vite Logo（示例）	无	开发环境展示用
src	App.tsx	React 组件	"function App(), useState, useEffect, Routes"	应用根组件，路由配置	"react-router-dom, @/components/layout"	管理页面路由、全局状态、主题
	index.css	CSS 文件	"@tailwind, @layer, 自定义类"	全局样式文件	Tailwind CSS	定义基础样式、重置、工具类
	main.tsx	入口文件	"createRoot, StrictMode, App"	React 应用入口点	"react, react-dom, @/App"	挂载应用到 DOM、提供上下文
	vite-env.d.ts	类型声明	"/// <reference types=""vite/client"" />"	Vite 环境类型声明	TypeScript	提供 import.meta.env 等类型
						
	src/assets					
	.gitkeep	Git 占位文件		保持空目录被 Git 跟踪	Git	确保 assets 目录存在于仓库
						
	src/components					
	components/.gitkeep	Git 占位文件		保持目录被跟踪	Git	组件目录占位
						
	src/components/activity					
	ActivityView.tsx	React 组件	"function ActivityView(), useAppStore, MatrixCard"	活动/日志视图组件	"@/stores/appStore, @/components/ui"	显示用户操作历史、系统日志
	index.ts	导出文件	export { ActivityView }	模块统一导出	ActivityView.tsx	简化导入路径
						
	src/components/charts					
	PriceChart.tsx	React 组件	"function PriceChart(), useChart, Canvas/Chart.js"	价格走势图组件	"recharts/chart.js, @/utils/formatting"	可视化市场价格历史数据
	index.ts	导出文件	export { PriceChart }	模块统一导出	PriceChart.tsx	简化导入路径
						
	src/components/dashboard					
	Dashboard.tsx	React 组件	"function Dashboard(), useAppStore, Tabs/Views"	仪表盘主视图	"@/components/*, @/stores/appStore"	聚合显示仓位、策略、分析等核心信息
	MarketsView.tsx	React 组件	"function MarketsView(), useState, useEffect, realtimeService"	市场扫描/订阅视图	"@/services/realtime, @/services/strategies"	显示市场列表、连接状态、策略信号
	MarketsView.tsx.backup	备份文件		旧版本备份	无	重构前保留
	PositionTable.tsx	React 组件	"function PositionTable(), formatCurrency, MatrixButton"	持仓表格组件	"@/types, @/utils/formatting"	显示活跃持仓、盈亏、操作按钮
	LLMAnalysis.tsx	React 组件	"function LLMAnalysis(), useAppStore, MatrixCard"	LLM 分析结果展示	"@/services/llm, @/stores/appStore"	显示 AI 对市场的预测和推理
	StrategyControl.tsx	React 组件	"function StrategyControl(), strategyManager, MatrixButton"	策略控制面板	@/services/strategies	启动/停止策略、调整参数
	ActivityFeed.tsx	React 组件	"function ActivityFeed(), useAppStore"	实时活动流组件	@/stores/appStore	显示最新交易、信号、系统事件
	PnLStats.tsx	React 组件	"function PnLStats(), formatCurrency, useAppStore"	盈亏统计组件	"@/utils/formatting, @/stores/appStore"	显示总盈亏、今日盈亏、未实现盈亏
	index.ts	导出文件	"export { Dashboard, MarketsView, ... }"	模块统一导出	所有子组件	简化导入路径
						
	src/components/markets					
	MarketScanner.tsx	React 组件	"function MarketScanner(), MatrixCard, MatrixButton"	市场扫描控制面板	@/services/realtime	显示连接状态、订阅数、消息计数
	MarketList.tsx	React 组件	"function MarketList(), filter, sort, MarketCard"	市场列表组件	@/utils/formatting	显示过滤/排序后的市场卡片
	MarketCard.tsx	React 组件	"function MarketCard(), formatCurrency, cn"	单个市场卡片组件	"@/utils/cn, @/utils/formatting"	显示市场问题、价格、成交量
	ConnectionLog.tsx	React 组件	"function ConnectionLog(), useRef, useEffect"	连接日志组件	无	实时显示 WebSocket 连接日志
	PopularMarkets.tsx	React 组件	"function PopularMarkets(), popularMarketsService"	热门市场模态框	@/services/polymarket/PopularMarketsService	扫描并添加 Polymarket 热门市场
	PopularMarketsService.ts	服务类	"class PopularMarketsService, getPopularMarkets()"	热门市场数据服务	/api/gamma/markets	从 Gamma API 获取热门市场列表
	MarketsView.tsx	React 组件		市场视图主组件（简化版）	@/components/markets/*	聚合子组件，管理状态
	index.ts	导出文件	"export { MarketScanner, MarketList, ... }"	模块统一导出	所有子组件	简化导入路径
						
	src/components/settings					
	SettingsPanel.tsx	React 组件	"function SettingsPanel(), useAppStore, apiConfigManager"	设置面板主组件	"@/services/api, @/stores/appStore"	配置交易参数、API Keys、策略
	StrategyConfig.tsx	React 组件	"function StrategyConfig(), strategyManager"	策略配置组件	@/services/strategies	启用/禁用策略、调整参数
	index.ts	导出文件	"export { SettingsPanel, StrategyConfig }"	模块统一导出	子组件	简化导入路径
						
	src/components/ui					
	MatrixCard.tsx	UI 组件	"function MatrixCard(), cn, props: title, subtitle, children"	矩阵风格卡片容器	@/utils/cn	统一卡片样式、标题、边框
	MatrixButton.tsx	UI 组件	"function MatrixButton(), cn, variant, size, loading"	矩阵风格按钮	@/utils/cn	支持 primary/secondary/success/danger 变体
	MatrixInput.tsx	UI 组件	"function MatrixInput(), cn, type, label, error"	矩阵风格输入框	@/utils/cn	支持文本、数字、密码类型
	MatrixModal.tsx	UI 组件	"function MatrixModal(), cn, isOpen, onClose, actions"	矩阵风格模态框	@/utils/cn	支持标题、内容、操作按钮
	MatrixLoading.tsx	UI 组件	"function MatrixLoading(), cn, text, fullScreen"	加载状态组件	@/utils/cn	显示加载动画和提示文本
	index.ts	导出文件	"export { MatrixCard, MatrixButton, ... }"	UI 组件统一导出	所有 UI 组件	简化导入路径
						
	src/hooks					
	useWallet.ts	自定义 Hook	"function useWallet(), connect(), disconnect(), getBalance()"	钱包管理 Hook	"@/services/wallet, ethers"	封装钱包连接、余额查询逻辑
	useDebounce.ts	自定义 Hook	"function useDebounce(value, delay)"	防抖 Hook	lodash/debounce	延迟执行函数，用于搜索输入
	usePolling.ts	自定义 Hook	"function usePolling(callback, interval)"	轮询 Hook	"useEffect, setInterval"	定期执行回调，用于数据刷新
	index.ts	导出文件	"export { useWallet, useDebounce, usePolling }"	Hook 统一导出	所有 hooks	简化导入路径
						
	src/services					
						
	src/services/api					
	baseClient.ts	基础类	"class BaseClient, fetch(), handleResponse()"	HTTP 客户端基类	axios/fetch	封装请求、错误处理、重试逻辑
	gammaClient.ts	API 客户端	"class GammaClient extends BaseClient, getMarkets(), getMarketBySlug()"	Gamma API 客户端	baseClient.ts	获取 Polymarket 市场数据
	DataClient.ts	API 客户端	"class DataClient, getOrderBook(), getTrades()"	聚合数据客户端	"gammaClient, clobClient"	统一数据访问接口
	ApiConfigManager.ts	配置管理	"class ApiConfigManager, saveProviderConfig(), validateApiKey()"	API 配置管理器	"secureStorage, crypto"	加密存储和管理 API Keys
	CLOBClient.ts	API 客户端	"class CLOBClient, placeOrder(), cancelOrder()"	CLOB 交易客户端	"baseClient, walletService"	执行链上交易操作
	index.ts	导出文件	"export { gammaClient, DataClient, ... }"	API 服务统一导出	所有客户端	简化导入路径
						
	src/services/llm					
	LLMService.ts	抽象服务	"abstract class LLMService, analyzeMarket(), generatePrediction()"	LLM 服务抽象基类	@/types	定义 AI 分析接口
	openRouterService.ts	具体实现	"class OpenRouterService extends LLMService, callAPI()"	OpenRouter 实现	"LLMService, ApiConfigManager"	调用 OpenRouter API 进行市场分析
						
	src/services/realtime					
	RealtimeService.ts	WebSocket 服务	"class RealtimeService, connect(), subscribe(), onMessage(), analyzeMarket()"	实时行情 WebSocket 服务	wss://ws-subscriptions-clob.polymarket.com	连接 Polymarket WebSocket、处理订单簿/价格更新
						
	src/services/strategies					
	baseStrategy.ts	抽象类	"abstract class BaseStrategy, analyze(), canTrade(), recordTrade()"	策略基类	@/types	定义策略接口、通用逻辑
	StrategyManager.ts	管理器	"class StrategyManager, registerStrategy(), startAll(), onSignal()"	策略管理器	"baseStrategy, EventEmitter"	注册/管理策略、分发信号
	StrategyService.ts	服务	"export const strategyManager, TradeSignal, StrategyConfig"	策略服务入口	"StrategyManager, BaseStrategy"	导出单例、类型定义
	llmPredictionStrategy.ts	具体策略	"class LLMPredictionStrategy extends BaseStrategy, analyze()"	LLM 预测策略	"baseStrategy, LLMService"	调用 LLM 分析市场并生成信号
	DipDetector.ts	工具类	"class DipDetector, detectDip(), calculateSupport()"	下跌检测工具	@/utils/formatting	识别价格下跌模式
	DipArbStrategy.ts	具体策略	"class DipArbStrategy extends BaseStrategy, analyze()"	下跌套利策略	"baseStrategy, DipDetector"	在价格下跌时买入套利
	index.ts	导出文件	"export { strategyManager, BaseStrategy, ... }"	策略服务统一导出	所有策略类	简化导入路径
						
	src/services/trading					
	TradingService.ts	交易服务	"class TradingService, createOrder(), cancelOrder(), executePaperTrade()"	交易执行服务	"@/services/api, @/services/wallet"	处理订单创建、纸面/真实交易
	PositionManager.ts	仓位管理	"class PositionManager, addPosition(), updatePnL(), calculateRisk()"	仓位管理服务	"@/types, @/utils/formatting"	管理持仓、计算盈亏和风险
	AutoTradingEngine.ts	自动交易	"class AutoTradingEngine, processSignal(), executeTrade()"	自动交易引擎	"strategyManager, TradingService"	监听策略信号并自动执行交易
	MarketScanner.ts	市场扫描	"class MarketScanner, scanPopularMarkets(), extractAssetIds()"	市场扫描服务	@/services/api/gammaClient	扫描并筛选热门市场
	ActivityLogger.ts	日志记录	"class ActivityLogger, logTrade(), logSignal()"	活动日志服务	@/types	记录交易和信号到日志
						
	src/services/wallet					
	WalletManager.ts	钱包管理	"class WalletManager, connect(), signMessage(), getBalance()"	钱包管理器	"ethers, @/utils/secureStorage"	管理钱包连接、签名、余额
	walletService.ts	服务	"export const walletService, ensureApproval()"	钱包服务入口	WalletManager	导出单例、封装常用操作
						
	src/stores					
	appStore.ts	Zustand Store	"create(), persist(), AppState interface, actions: connectWallet, addPosition, ..."	全局状态管理	"zustand, zustand/middleware/persist"	集中管理钱包、市场、仓位、设置等状态
						
	src/types					
	index.ts	类型定义	"export interface Market, Position, Trade, TradeSignal, StrategyConfig, ..."	TypeScript 类型定义	无	统一类型导出，确保类型安全
						
	src/utils					
	cn.ts	工具函数	function cn(...inputs): string	class name 合并工具	"clsx, tailwind-merge"	合并 Tailwind 类名，处理条件样式
	formatting.ts	工具函数	"formatCurrency(), formatPercent(), formatAddress()"	格式化函数	无	格式化金额、百分比、地址等
	secureStorage.ts	工具函数	"encrypt(), decrypt(), saveEncrypted()"	加密存储工具	"crypto-js, bcrypt"	加密存储敏感数据（如 API Keys）
	rpcConfig.ts	配置	"POLYGON_RPC_URL, POLYGONSCAN_API_KEY"	RPC 配置常量	无	定义区块链节点和 API 地址
	constants.ts	配置	"DEFAULT_STRATEGY_PARAMS, MAX_RETRIES, WS_TIMEOUT"	应用常量	无	定义默认参数、超时时间等
	index.ts	导出文件	"export { cn, formatCurrency, ... }"	工具函数统一导出	所有 utils	简化导入路径
						
	src/test					
	setup.ts	测试配置	"vi.mock(), global.setup()"	Vitest 测试环境配置	"vitest, @testing-library"	设置测试上下文、mock 全局依赖
