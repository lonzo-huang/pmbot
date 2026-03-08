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

    // 设置画布尺寸为全屏
    const resizeCanvas = () => {
      canvas.width = window.innerWidth
      canvas.height = window.innerHeight
    }
    resizeCanvas()
    window.addEventListener('resize', resizeCanvas)

    // ===== 黑客帝国雨效果配置 =====
    const config = {
      fontSize: 16,                    // 字体大小
      columnSpacing: 18,               // 列间距（越小越密集）
      fallSpeed: 1,                 // 下落速度（像素/帧）
      characters: '01',                // 使用 0 和 1
      fadeOpacity: 0.05,               // 背景淡出速度（越小拖尾越长）
      headBrightness: 1.0,             // 头部亮度
      tailBrightness: 0.3,             // 尾部亮度
    }

    // 计算列数
    const columns = Math.floor(canvas.width / config.columnSpacing)

    // 初始化每列的 Y 位置（随机分布在屏幕上方）
    const drops: number[] = []
    for (let i = 0; i < columns; i++) {
      drops[i] = Math.random() * -100  // 从屏幕上方不同位置开始
    }

    // 动画循环
    let animationId: number
    const animate = () => {
      // 半透明黑色背景（创建拖尾效果）
      ctx.fillStyle = `rgba(0, 0, 0, ${config.fadeOpacity})`
      ctx.fillRect(0, 0, canvas.width, canvas.height)

      // 设置字体样式
      ctx.font = `${config.fontSize}px 'JetBrains Mono', monospace`

      // 绘制每一列
      for (let i = 0; i < drops.length; i++) {
        // 随机选择 0 或 1
        const char = Math.random() > 0.5 ? '0' : '1'

        // 计算 X 位置
        const x = i * config.columnSpacing

        // 计算 Y 位置
        const y = drops[i] * config.fontSize

        // 绘制字符（带发光效果）
        ctx.fillStyle = '#00ff00'
        ctx.shadowBlur = 8
        ctx.shadowColor = '#00ff00'
        ctx.fillText(char, x, y)
        ctx.shadowBlur = 0

        // 更新下落位置
        // 随机重置到顶部（当超出屏幕时）
        if (y > canvas.height && Math.random() > 0.975) {
          drops[i] = 0
        } else {
          drops[i]++
        }
      }

      animationId = requestAnimationFrame(animate)
    }

    // 启动动画
    animate()

    // 清理
    return () => {
      cancelAnimationFrame(animationId)
      window.removeEventListener('resize', resizeCanvas)
    }
  }, [])

  return (
    <div className={cn('relative min-h-screen bg-black text-green-400 font-mono', className)}>
      {/* Matrix Rain Background - Canvas 渲染 */}
      {showRain && (
        <canvas
          ref={canvasRef}
          className="fixed inset-0 pointer-events-none"
          style={{
            zIndex: 0,
            background: '#000000'
          }}
        />
      )}

      {/* Content */}
      <div className="relative" style={{ zIndex: 10 }}>
        {children}
      </div>
    </div>
  )
}