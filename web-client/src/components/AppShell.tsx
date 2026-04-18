// AppShell is the main layout wrapper for all authenticated pages.
// Sidebar: fixed on desktop (lg+), slide-out overlay on mobile.
// Mobile toggle state is managed via SidebarContext so each page's
// sticky header can wire its own hamburger button independently.
// Profile/account actions live in a footer at the bottom of the sidebar.
// Page content renders via <Outlet /> with no top bar — each page owns its header.

import { useState, useEffect } from 'react'
import { Outlet, NavLink, Link, useLocation } from 'react-router'
import { SidebarProvider, useSidebar } from './SidebarContext'
import ProfileDropdown from './ProfileDropdown'
import { fetchOverdueTaskCount } from '../api'
import { todayString } from '../utils/dates'
import { TaskMutationProvider, useTaskMutation } from './tasks/TaskMutationContext'

function Shell() {
  const { open, setOpen } = useSidebar()
  const location = useLocation()
  const { mutationKey } = useTaskMutation()

  // Overdue task count for the nav badge — refetched on navigation and after
  // any task mutation (mutationKey bumped by TaskMutationContext).
  const [overdueCount, setOverdueCount] = useState(0)
  useEffect(() => {
    fetchOverdueTaskCount(todayString())
      .then(res => setOverdueCount(res.count))
      .catch(() => setOverdueCount(0))
  }, [location.pathname, mutationKey])

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Sidebar overlay (mobile) */}
      {open && (
        <div
          className="fixed inset-0 bg-black/40 z-40 lg:hidden"
          onClick={() => setOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside
        className={`fixed top-0 left-0 h-full w-64 bg-white border-r border-gray-200 z-50 flex flex-col transition-transform lg:translate-x-0 ${
          open ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        {/* Logo — h-14 matches all page sticky headers to create one continuous chrome line */}
        <div className="h-14 flex items-center px-5 border-b border-gray-200 shrink-0">
          <h1 className="text-xl font-bold text-stride-600">Stride</h1>
        </div>

        {/* Nav */}
        <nav className="p-3 flex-1">
          {/* Calorie Log — hover reveals a gear icon linking to settings */}
          <div className="group relative">
            <NavLink
              to="/calorie-log"
              onClick={() => setOpen(false)}
              className={({ isActive }) =>
                `flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm pr-8 ${
                  isActive ? 'bg-stride-50 text-stride-700 font-medium' : 'text-gray-600 hover:bg-gray-50'
                }`
              }
            >
              <svg className="w-5 h-5 shrink-0" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M15.362 5.214A8.252 8.252 0 0 1 12 21 8.25 8.25 0 0 1 6.038 7.047 8.287 8.287 0 0 0 9 9.601a8.983 8.983 0 0 1 3.361-6.867 8.21 8.21 0 0 0 3 2.48Z" />
              </svg>
              Calorie Log
            </NavLink>
            {/* Gear icon — appears on hover, navigates to settings */}
            <Link
              to="/settings"
              onClick={() => setOpen(false)}
              title="Calorie Log settings"
              className="absolute right-1.5 top-1/2 -translate-y-1/2 p-1 rounded opacity-0 group-hover:opacity-100 transition-opacity text-gray-400 hover:text-gray-600 hover:bg-gray-200"
            >
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.325.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 0 1 1.37.49l1.296 2.247a1.125 1.125 0 0 1-.26 1.431l-1.003.827c-.293.241-.438.613-.43.992a7.723 7.723 0 0 1 0 .255c-.008.378.137.75.43.991l1.004.827c.424.35.534.955.26 1.43l-1.298 2.247a1.125 1.125 0 0 1-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.47 6.47 0 0 1-.22.128c-.331.183-.581.495-.644.869l-.213 1.281c-.09.543-.56.94-1.11.94h-2.594c-.55 0-1.019-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 0 1-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 0 1-1.369-.49l-1.297-2.247a1.125 1.125 0 0 1 .26-1.431l1.004-.827c.292-.24.437-.613.43-.991a6.932 6.932 0 0 1 0-.255c.007-.38-.138-.751-.43-.992l-1.004-.827a1.125 1.125 0 0 1-.26-1.43l1.297-2.247a1.125 1.125 0 0 1 1.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.086.22-.128.332-.183.582-.495.644-.869l.214-1.28Z" />
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z" />
              </svg>
            </Link>
          </div>
          <NavLink
            to="/meal-plan"
            onClick={() => setOpen(false)}
            className={({ isActive }) =>
              `flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm mt-1 ${
                isActive ? 'bg-stride-50 text-stride-700 font-medium' : 'text-gray-600 hover:bg-gray-50'
              }`
            }
          >
            {/* Calendar-days icon — meal planning */}
            <svg className="w-5 h-5 shrink-0" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121 7.5v11.25m-18 0A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75m-18 0v-7.5A2.25 2.25 0 015.25 9h13.5A2.25 2.25 0 0121 11.25v7.5m-9-6h.008v.008H12v-.008zM12 15h.008v.008H12V15zm0 2.25h.008v.008H12v-.008zM9.75 15h.008v.008H9.75V15zm0 2.25h.008v.008H9.75v-.008zM7.5 15h.008v.008H7.5V15zm0 2.25h.008v.008H7.5v-.008zm6.75-4.5h.008v.008h-.008v-.008zm0 2.25h.008v.008h-.008V15zm0 2.25h.008v.008h-.008v-.008zm2.25-4.5h.008v.008H16.5v-.008zm0 2.25h.008v.008H16.5V15z" />
            </svg>
            Meal Planning
          </NavLink>
          <NavLink
            to="/habits"
            onClick={() => setOpen(false)}
            className={({ isActive }) =>
              `flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm mt-1 ${
                isActive ? 'bg-stride-50 text-stride-700 font-medium' : 'text-gray-600 hover:bg-gray-50'
              }`
            }
          >
            {/* Circle with checkmark — habit tracker icon */}
            <svg className="w-5 h-5 shrink-0" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            Habits
          </NavLink>
          <NavLink
            to="/journal"
            onClick={() => setOpen(false)}
            className={({ isActive }) =>
              `flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm mt-1 ${
                isActive ? 'bg-stride-50 text-stride-700 font-medium' : 'text-gray-600 hover:bg-gray-50'
              }`
            }
          >
            {/* Pencil-square — journal icon */}
            <svg className="w-5 h-5 shrink-0" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0115.75 21H5.25A2.25 2.25 0 013 18.75V8.25A2.25 2.25 0 015.25 6H10" />
            </svg>
            Journal
          </NavLink>
          <NavLink
            to="/tasks"
            onClick={() => setOpen(false)}
            className={({ isActive }) =>
              `flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm mt-1 ${
                isActive ? 'bg-stride-50 text-stride-700 font-medium' : 'text-gray-600 hover:bg-gray-50'
              }`
            }
          >
            {/* Checklist / queue-list icon */}
            <svg className="w-5 h-5 shrink-0" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 6.75h12M8.25 12h12m-12 5.25h12M3.75 6.75h.007v.008H3.75V6.75zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zM3.75 12h.007v.008H3.75V12zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm-.375 5.25h.007v.008H3.75v-.008zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0z" />
            </svg>
            Tasks
            {/* Overdue badge — shown when there are tasks past their due date */}
            {overdueCount > 0 && (
              <span className="ml-auto bg-red-500 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full leading-none">
                {overdueCount > 99 ? '99+' : overdueCount}
              </span>
            )}
          </NavLink>
          <NavLink
            to="/recipes"
            onClick={() => setOpen(false)}
            className={({ isActive }) =>
              `flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm mt-1 ${
                isActive ? 'bg-stride-50 text-stride-700 font-medium' : 'text-gray-600 hover:bg-gray-50'
              }`
            }
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 6.042A8.967 8.967 0 0 0 6 3.75c-1.052 0-2.062.18-3 .512v14.25A8.987 8.987 0 0 1 6 18c2.305 0 4.408.867 6 2.292m0-14.25a8.966 8.966 0 0 1 6-2.292c1.052 0 2.062.18 3 .512v14.25A8.987 8.987 0 0 0 18 18a8.967 8.967 0 0 0-6 2.292m0-14.25v14.25" />
            </svg>
            Recipes
          </NavLink>
        </nav>

        {/* Profile footer — positioned at the bottom of the sidebar */}
        <div className="border-t border-gray-200 p-3 shrink-0">
          <ProfileDropdown />
        </div>
      </aside>

      {/* Main content — pages own their sticky headers */}
      <main className="lg:ml-64 min-h-screen">
        <Outlet />
      </main>
    </div>
  )
}

// AppShell wraps Shell in both SidebarProvider and TaskMutationProvider so
// useSidebar() and useTaskMutation() work anywhere in the routed tree.
export default function AppShell() {
  return (
    <TaskMutationProvider>
      <SidebarProvider>
        <Shell />
      </SidebarProvider>
    </TaskMutationProvider>
  )
}
