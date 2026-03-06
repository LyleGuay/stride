// SidebarContext provides mobile sidebar open/close state to any page
// so each page's sticky header can wire its own hamburger button without
// prop-drilling through AppShell.
import { createContext, useContext, useState } from 'react'
import type { ReactNode } from 'react'

interface SidebarContextValue {
  open: boolean
  setOpen: (v: boolean) => void
}

const SidebarContext = createContext<SidebarContextValue>({
  open: false,
  setOpen: () => {},
})

export function SidebarProvider({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false)
  return (
    <SidebarContext.Provider value={{ open, setOpen }}>
      {children}
    </SidebarContext.Provider>
  )
}

// useSidebar lets any page header open the mobile sidebar.
// eslint-disable-next-line react-refresh/only-export-components
export function useSidebar() {
  return useContext(SidebarContext)
}
