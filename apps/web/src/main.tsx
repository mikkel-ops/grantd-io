import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { AuthProvider } from '@/lib/auth'
import App from './App'
import './index.css'

console.log('main.tsx loading...')
console.log('VITE_COGNITO_USER_POOL_ID:', import.meta.env.VITE_COGNITO_USER_POOL_ID)
console.log('VITE_COGNITO_CLIENT_ID:', import.meta.env.VITE_COGNITO_CLIENT_ID)

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60, // 1 minute
      retry: 1,
    },
  },
})

try {
  ReactDOM.createRoot(document.getElementById('root')!).render(
    <React.StrictMode>
      <QueryClientProvider client={queryClient}>
        <BrowserRouter>
          <AuthProvider>
            <App />
          </AuthProvider>
        </BrowserRouter>
      </QueryClientProvider>
    </React.StrictMode>
  )
  console.log('React rendered successfully')
} catch (error) {
  console.error('Error rendering React:', error)
  document.getElementById('root')!.innerHTML = `<pre style="color: red;">Error: ${error}</pre>`
}
