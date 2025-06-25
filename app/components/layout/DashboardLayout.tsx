"use client"

import { ReactNode, useState } from "react"
import Sidebar from "./Sidebar"
import FilterBar from "./FilterBar"
import { useDashboard } from "../../context/DashboardContext"

interface DashboardLayoutProps {
  children: ReactNode
  selectedCustomers: string[]
  setSelectedCustomers: (customers: string[]) => void
  selectedProjects: string[]
  setSelectedProjects: (projects: string[]) => void
  selectedResources: string[]
  setSelectedResources: (resources: string[]) => void
  activeTab: string
  customers: string[]
  projects: string[]
  resources: string[]
  loading?: boolean
  kpis?: any
}

export default function DashboardLayout({
  children,
  selectedCustomers,
  setSelectedCustomers,
  selectedProjects,
  setSelectedProjects,
  selectedResources,
  setSelectedResources,
  activeTab,
  customers,
  projects,
  resources,
  loading,
  kpis,
}: DashboardLayoutProps) {
  const [sidebarTab, setSidebarTab] = useState("dashboard")
  const { selectedDateRange, setSelectedDateRange } = useDashboard()

  return (
    <div className="flex h-screen w-full bg-background overflow-hidden">
      {/* Left Sidebar - sticky */}
      <div className="sticky top-0 h-screen">
        <Sidebar activeTab={activeTab} sidebarTab={sidebarTab} setSidebarTab={setSidebarTab} />
      </div>

      {/* Main Content - scrollable */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Dashboard Content */}
        <div className="flex flex-1 overflow-hidden">
          {/* Main Dashboard - scrollable */}
          <div className="flex-1 overflow-auto h-screen">
            <div className="p-4">
              {activeTab !== "chatbot" && (
                <FilterBar
                  selectedCustomers={selectedCustomers}
                  setSelectedCustomers={setSelectedCustomers}
                  selectedProjects={selectedProjects}
                  setSelectedProjects={setSelectedProjects}
                  selectedResources={selectedResources}
                  setSelectedResources={setSelectedResources}
                  customers={customers}
                  projects={projects}
                  resources={resources}
                  activeTab={activeTab}
                  selectedDateRange={selectedDateRange}
                  setSelectedDateRange={setSelectedDateRange}
                />
              )}
              
              {/* Main content (children) */}
              {children}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
} 