import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
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
    <BrowserRouter>
      <AuthProvider>
        <Root />
      </AuthProvider>
    </BrowserRouter>
  </React.StrictMode>,
)
