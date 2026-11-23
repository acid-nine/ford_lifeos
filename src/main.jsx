import React from 'react'
import { createRoot } from 'react-dom/client'
import App from './App.jsx'
import { DataProvider, ToastProvider } from './store.jsx'
import './styles.css'

createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <ToastProvider>
      <DataProvider>
        <App />
      </DataProvider>
    </ToastProvider>
  </React.StrictMode>,
)
