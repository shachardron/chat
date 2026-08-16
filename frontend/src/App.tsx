import { useEffect, useState } from 'react'
import { isAuthenticated, isAdmin } from './lib/auth'
import ChatPage    from './components/ChatPage'
import AdminPage   from './components/AdminPage'
import CallbackPage from './components/CallbackPage'
import LogoutPage  from './components/LogoutPage'
import LoginPage   from './components/LoginPage'

type Route = 'login' | 'callback' | 'logout' | 'chat' | 'admin'

function getRoute(): Route {
  const p = window.location.pathname
  if (p === '/callback') return 'callback'
  if (p === '/logout')   return 'logout'
  if (!isAuthenticated()) return 'login'
  if (p === '/admin')    return isAdmin() ? 'admin' : 'chat'
  return 'chat'
}

export default function App() {
  const [route, setRoute] = useState<Route>(getRoute)

  const handleAuthSuccess = () => {
    window.history.replaceState({}, '', '/')
    setRoute('chat')
  }

  useEffect(() => {
    setRoute(getRoute())
  }, [])

  switch (route) {
    case 'callback': return <CallbackPage onSuccess={handleAuthSuccess} />
    case 'logout':   return <LogoutPage />
    case 'admin':    return <AdminPage />
    case 'chat':     return <ChatPage />
    default:         return <LoginPage />
  }
}
