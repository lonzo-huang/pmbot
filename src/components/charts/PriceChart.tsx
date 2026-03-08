import React, { useEffect, useRef } from 'react'
import { PriceUpdate } from '@/services/realtime/RealtimeService'

interface PriceChartProps {
  data: PriceUpdate[]
  width?: number
  height?: number
  showGrid?: boolean
  showLabels?: boolean
}

export const PriceChart: React.FC<PriceChartProps> = ({
  data,
  width = 800,
  height = 400,
  showGrid = true,
  showLabels = true,
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    
    // Clear canvas
    ctx.clearRect(0, 0, width, height)
    
    // Background
    ctx.fillStyle = '#0a0a0a'
    ctx.fillRect(0, 0, width, height)
    
    if (data.length < 2) return
    
    // Calculate scales
    const prices = data.map(d => d.price)
    const minPrice = Math.min(...prices) * 0.95
    const maxPrice = Math.max(...prices) * 1.05
    const priceRange = maxPrice - minPrice
    
    const padding = 40
    const chartWidth = width - padding * 2
    const chartHeight = height - padding * 2
    
    // Draw grid
    if (showGrid) {
      ctx.strokeStyle = '#003300'
      ctx.lineWidth = 0.5
      
      for (let i = 0; i <= 5; i++) {
        const y = padding + (chartHeight / 5) * i
        ctx.beginPath()
        ctx.moveTo(padding, y)
        ctx.lineTo(width - padding, y)
        ctx.stroke()
      }
    }
    
    // Draw YES line (green)
    ctx.strokeStyle = '#00ff00'
    ctx.lineWidth = 2
    ctx.beginPath()
    
    data.forEach((point, index) => {
      const x = padding + (index / (data.length - 1)) * chartWidth
      const y = padding + chartHeight - ((point.price - minPrice) / priceRange) * chartHeight
      
      if (index === 0) {
        ctx.moveTo(x, y)
      } else {
        ctx.lineTo(x, y)
      }
    })
    
    ctx.stroke()
    
    // Draw NO line (red)
    ctx.strokeStyle = '#ff0040'
    ctx.lineWidth = 2
    ctx.beginPath()
    
    data.forEach((point, index) => {
      const noPrice = 1 - point.price
      const x = padding + (index / (data.length - 1)) * chartWidth
      const y = padding + chartHeight - ((noPrice - minPrice) / priceRange) * chartHeight
      
      if (index === 0) {
        ctx.moveTo(x, y)
      } else {
        ctx.lineTo(x, y)
      }
    })
    
    ctx.stroke()
    
    // Draw labels
    if (showLabels) {
      ctx.fillStyle = '#00ff00'
      ctx.font = '12px monospace'
      ctx.fillText(`YES: ${(data[data.length - 1]?.price * 100).toFixed(1)}%`, padding, 20)
      
      ctx.fillStyle = '#ff0040'
      ctx.fillText(`NO: ${((1 - data[data.length - 1]?.price) * 100).toFixed(1)}%`, padding + 100, 20)
    }
    
  }, [data, width, height, showGrid, showLabels])
  
  return (
    <div className="border border-green-500 rounded-lg overflow-hidden">
      <canvas
        ref={canvasRef}
        width={width}
        height={height}
        className="w-full"
      />
    </div>
  )
}