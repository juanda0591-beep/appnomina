import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { Toaster } from 'react-hot-toast'
import { MantineProvider } from '@mantine/core'
// El CSS de Mantine va ANTES que el propio para que index.css tenga prioridad
import '@mantine/core/styles.css'
import '@mantine/charts/styles.css'
import App from './App.jsx'
import Login from './pages/Login.jsx'
import { DataProvider } from './context/DataContext.jsx'
import { AuthProvider, useAuth } from './context/AuthContext.jsx'
import './index.css'

function Root() {
  const { token } = useAuth()
  if (!token) return <Login />
  return (
    <DataProvider>
      <App />
    </DataProvider>
  )
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <MantineProvider>
      <BrowserRouter>
        <AuthProvider>
          <Root />
          <Toaster position="top-center" toastOptions={{ duration: 3500 }} />
        </AuthProvider>
      </BrowserRouter>
    </MantineProvider>
  </React.StrictMode>,
)
