import React, { useEffect, useRef } from 'react'
import { cn } from '@/utils/cn'

interface MatrixContainerProps {
  children: React.ReactNode
  className?: string
  showRain?: boolean
}

export const MatrixContainer: React.FC<MatrixContainerProps> = ({
  children,
  className,
  showRain = true,
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    const ctx = canvas.getContext('2d')
    if (!ctx) return

    // 画布尺寸适配
    const resizeCanvas = () => {
      canvas.width = window.innerWidth
      canvas.height = window.innerHeight
      initColumns() // 窗口缩放时重新初始化列，保证适配
    }

    // ========== 核心配置（全局范围，每列会在范围内随机生成独立属性）==========
    const GLOBAL_CONFIG = {
      fontSize: 18,                // 基础字体大小
      minColumnSpacing: 20,        // 最小列间距（保证不拥挤）
      maxColumnSpacing: 30,        // 最大列间距（保证错落感）
      minFallSpeed: 0.2,           // 最慢下落速度
      maxFallSpeed: 0.8,           // 最快下落速度（仅少数列会达到，不头晕）
      minTrailLength: 20,           // 最短拖尾长度
      maxTrailLength: 55,          // 最长拖尾长度
      minCharUpdateRate: 2,        // 最慢字符更新频率（每N帧换一次字符）
      maxCharUpdateRate: 6,        // 最快字符更新频率
      baseFadeOpacity: 0.06,       // 背景淡出速度（控制整体拖尾残留）
      baseBrightness: 0.9,         // 基础亮度（不抢界面内容的镜）
      headGlowIntensity: 0.8,      // 头部字符发光强度
    }

    // 列数据结构（每列独立属性，彻底解决整齐问题）
    type ColumnData = {
      x: number;               // 列的X坐标（随机间距，不整齐）
      y: number;               // 列头部的Y坐标
      speed: number;           // 该列专属下落速度（快慢不一）
      trailLength: number;     // 该列专属拖尾长度（长短不一）
      updateRate: number;      // 该列专属字符更新频率（闪烁节奏不一）
      frameCount: number;      // 该列帧计数（控制字符更新）
      chars: string[];         // 该列的字符队列
      brightness: number;      // 该列专属亮度（明暗不一）
    }
    let columns: ColumnData[] = []

    // 初始化列（完全随机化，彻底打破整齐感）
    const initColumns = () => {
      columns = []
      let currentX = 0
      // 循环生成列，间距随机，不固定
      while (currentX < canvas.width) {
        // 随机列间距
        const columnSpacing = Math.floor(
          Math.random() * (GLOBAL_CONFIG.maxColumnSpacing - GLOBAL_CONFIG.minColumnSpacing)
          + GLOBAL_CONFIG.minColumnSpacing
        )

        // 生成该列的专属随机属性
        columns.push({
          x: currentX,
          y: Math.random() * -canvas.height, // 随机起始位置，完全错开
          speed: Math.random() * (GLOBAL_CONFIG.maxFallSpeed - GLOBAL_CONFIG.minFallSpeed) + GLOBAL_CONFIG.minFallSpeed,
          trailLength: Math.floor(Math.random() * (GLOBAL_CONFIG.maxTrailLength - GLOBAL_CONFIG.minTrailLength) + GLOBAL_CONFIG.minTrailLength),
          updateRate: Math.floor(Math.random() * (GLOBAL_CONFIG.maxCharUpdateRate - GLOBAL_CONFIG.minCharUpdateRate) + GLOBAL_CONFIG.minCharUpdateRate),
          frameCount: Math.floor(Math.random() * 10), // 随机初始帧计数，错开更新节奏
          chars: new Array(Math.floor(Math.random() * 3 + 1)).fill('').map(() => Math.random() > 0.5 ? '0' : '1'),
          brightness: Math.random() * 0.4 + 0.6, // 60%-100%亮度，明暗错落
        })

        currentX += columnSpacing
      }
    }

    // 初始化画布和列
    resizeCanvas()
    window.addEventListener('resize', resizeCanvas)

    // 动画循环
    let animationId: number
    const animate = () => {
      // 半透明背景，生成拖尾效果
      ctx.fillStyle = `rgba(0, 0, 0, ${GLOBAL_CONFIG.baseFadeOpacity})`
      ctx.fillRect(0, 0, canvas.width, canvas.height)

      // 全局字体设置
      ctx.font = `${GLOBAL_CONFIG.fontSize}px 'JetBrains Mono', monospace`
      ctx.textBaseline = 'top'

      // 逐列绘制，每列按自己的属性运行
      columns.forEach((col) => {
        // 1. 更新该列的帧计数，控制字符更新节奏
        col.frameCount++

        // 2. 按该列的更新频率，刷新头部字符
        if (col.frameCount % col.updateRate === 0) {
          col.chars.unshift(Math.random() > 0.5 ? '0' : '1')
          // 限制拖尾长度，避免拥挤
          if (col.chars.length > col.trailLength) {
            col.chars.pop()
          }
        }

        // 3. 绘制该列的所有字符，头部最亮，尾部渐暗
        col.chars.forEach((char, index) => {
          const yPos = col.y + index * GLOBAL_CONFIG.fontSize
          // 只绘制屏幕内的字符，优化性能
          if (yPos < -GLOBAL_CONFIG.fontSize || yPos > canvas.height) return

          // 计算该字符的亮度：头部最亮，尾部逐渐变暗，叠加列专属亮度
          const charBrightness = (1 - index / col.trailLength) * col.brightness * GLOBAL_CONFIG.baseBrightness
          const isHead = index === 0

          // 绘制字符，头部带发光效果
          ctx.fillStyle = `rgba(0, 255, 0, ${charBrightness})`
          ctx.shadowBlur = isHead ? GLOBAL_CONFIG.headGlowIntensity * 5 : 0
          ctx.shadowColor = isHead ? `rgba(0, 255, 0, ${charBrightness})` : 'transparent'
          ctx.fillText(char, col.x, yPos)
          ctx.shadowBlur = 0
        })

        // 4. 按该列的专属速度下落
        col.y += col.speed

        // 5. 随机重置列（完全随机时机，不会整排一起重置）
        const isOutOfScreen = col.y > canvas.height
        const randomResetChance = Math.random() < 0.008
        if (isOutOfScreen && randomResetChance) {
          // 重置时重新随机该列的所有属性，保证永远不整齐
          col.y = -GLOBAL_CONFIG.fontSize * (Math.random() * 20)
          col.speed = Math.random() * (GLOBAL_CONFIG.maxFallSpeed - GLOBAL_CONFIG.minFallSpeed) + GLOBAL_CONFIG.minFallSpeed
          col.trailLength = Math.floor(Math.random() * (GLOBAL_CONFIG.maxTrailLength - GLOBAL_CONFIG.minTrailLength) + GLOBAL_CONFIG.minTrailLength)
          col.updateRate = Math.floor(Math.random() * (GLOBAL_CONFIG.maxCharUpdateRate - GLOBAL_CONFIG.minCharUpdateRate) + GLOBAL_CONFIG.minCharUpdateRate)
          col.brightness = Math.random() * 0.4 + 0.6
          col.chars = [Math.random() > 0.5 ? '0' : '1']
        }
      })

      animationId = requestAnimationFrame(animate)
    }

    // 启动动画
    animate()

    // 组件卸载清理
    return () => {
      cancelAnimationFrame(animationId)
      window.removeEventListener('resize', resizeCanvas)
    }
  }, [])

  return (
    <div className={cn('relative min-h-screen bg-black text-green-400 font-mono', className)}>
      {/* 数字雨背景 */}
      {showRain && (
        <canvas
          ref={canvasRef}
          className="fixed inset-0 pointer-events-none"
          style={{ zIndex: 0, background: '#000000' }}
        />
      )}
      {/* 页面内容（层级高于背景） */}
      <div className="relative" style={{ zIndex: 10 }}>
        {children}
      </div>
    </div>
  )
}