import axios, { AxiosInstance, AxiosError } from 'axios'

interface ApiConfig {
  baseURL: string
  timeout?: number
  retries?: number
}

export class BaseApiClient {
  private client: AxiosInstance
  private config: ApiConfig
  
  constructor(config: ApiConfig) {
    this.config = {
      timeout: 10000,
      retries: 3,
      ...config
    }
    
    this.client = axios.create({
      baseURL: this.config.baseURL,
      timeout: this.config.timeout,
      headers: {
        'Content-Type': 'application/json'
      }
    })
    
    this.setupInterceptors()
  }
  
  private setupInterceptors() {
    // 请求拦截器
    this.client.interceptors.request.use(
      (config) => {
        console.log(`[API] ${config.method?.toUpperCase()} ${config.url}`)
        return config
      },
      (error) => Promise.reject(error)
    )
    
    // 响应拦截器
    this.client.interceptors.response.use(
      (response) => response,
      async (error: AxiosError) => {
        const originalRequest = error.config as any
        
        // 重试逻辑
        if (error.response?.status && 
            [429, 500, 502, 503, 504].includes(error.response.status) &&
            originalRequest._retryCount < this.config.retries!) {
          
          originalRequest._retryCount = (originalRequest._retryCount || 0) + 1
          const delay = 1000 * Math.pow(2, originalRequest._retryCount - 1)
          
          console.log(`[API] Retry ${originalRequest._retryCount}/${this.config.retries} after ${delay}ms`)
          await new Promise(resolve => setTimeout(resolve, delay))
          
          return this.client(originalRequest)
        }
        
        return Promise.reject(error)
      }
    )
  }
  
  async get<T>(url: string, params?: any): Promise<T> {
    const response = await this.client.get<T>(url, { params })
    return response.data
  }
  
  async post<T>(url: string, data?: any): Promise<T> {
    const response = await this.client.post<T>(url, data)
    return response.data
  }
  
  async put<T>(url: string, data?: any): Promise<T> {
    const response = await this.client.put<T>(url, data)
    return response.data
  }
  
  async delete<T>(url: string): Promise<T> {
    const response = await this.client.delete<T>(url)
    return response.data
  }
}