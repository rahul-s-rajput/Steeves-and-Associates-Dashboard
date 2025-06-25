"use client"

import React, { createContext, useContext, useState, useEffect, ReactNode, useMemo, useCallback } from 'react'

// Define the project data type based on the CSV structure
interface ProjectData {
  "Customer Name": string
  "Project": string
  "Worked Date": string
  "Task or Ticket Title": string
  "Resource Name": string
  "Billable Hours": number
  "Hourly Billing Rate": number
  "Extended Price": number
  "Detailed Customer Category": string
  [key: string]: string | number // For dynamic access
}

interface ProjectStats {
  total_revenue: number
  total_projects: number
  total_customers: number
  total_hours: number
  avg_hourly_rate: number
  customer_categories: Record<string, number>
  revenue_by_customer: Record<string, number>
  revenue_by_project: Record<string, number>
  monthly_revenue: Record<string, number>
}

interface DashboardContextType {
  projectData: ProjectData[]
  projectStats: ProjectStats | null
  selectedCustomers: string[]
  setSelectedCustomers: (customers: string[]) => void
  selectedProjects: string[]
  setSelectedProjects: (projects: string[]) => void
  selectedResources: string[]
  setSelectedResources: (resources: string[]) => void
  selectedDateRange: { start: string; end: string }
  setSelectedDateRange: (range: { start: string; end: string }) => void
  loading: boolean
  customers: string[]
  projects: string[]
  resources: string[]
  filteredProjectData: ProjectData[]
  formatCurrency: (value: number) => string
  formatNumber: (value: number) => string
  getRevenueByMonth: () => Array<{ month: string; revenue: number }>
  getRevenueByCustomer: () => Array<{ customer: string; revenue: number }>
  getRevenueByProject: () => Array<{ project: string; revenue: number }>
  getHoursByResource: () => Array<{ resource: string; hours: number }>
}

const DashboardContext = createContext<DashboardContextType | undefined>(undefined)

export function useDashboard() {
  const context = useContext(DashboardContext)
  if (context === undefined) {
    throw new Error('useDashboard must be used within a DashboardProvider')
  }
  return context
}

interface DashboardProviderProps {
  children: ReactNode
}

export function DashboardProvider({ children }: DashboardProviderProps) {
  const [projectData, setProjectData] = useState<ProjectData[]>([])
  const [projectStats, setProjectStats] = useState<ProjectStats | null>(null)
  const [selectedCustomers, setSelectedCustomers] = useState<string[]>(["all"])
  const [selectedProjects, setSelectedProjects] = useState<string[]>(["all"])
  const [selectedResources, setSelectedResources] = useState<string[]>(["all"])
  const [selectedDateRange, setSelectedDateRange] = useState<{ start: string; end: string }>({
    start: "2020-01-01",
    end: "2024-12-31"
  })
  const [loading, setLoading] = useState<boolean>(true)

  // Format currency
  const formatCurrency = (value: number) => {
    if (value >= 1000000000) {
      return `$${(Math.round(value / 100000000) / 10).toFixed(1)}B`
    } else if (value >= 1000000) {
      return `$${(Math.round(value / 100000) / 10).toFixed(1)}M`
    } else if (value >= 1000) {
      return `$${(Math.round(value / 100) / 10).toFixed(1)}K`
    } else {
      return `$${Math.round(value)}`
    }
  }

  // Format numbers with K/M suffix
  const formatNumber = (value: number): string => {
    if (value >= 1000000) {
      return `${(Math.round(value / 100000) / 10).toFixed(1)}M`
    } else if (value >= 1000) {
      return `${(Math.round(value / 100) / 10).toFixed(1)}K`
    }
    return Math.round(value).toString()
  }

  // Get unique customers and projects - memoized
  const customers = useMemo(() => {
    if (!projectData || projectData.length === 0) return []
    return [...new Set(projectData.map(item => item["Customer Name"]))].sort()
  }, [projectData])
  
  const projects = useMemo(() => {
    if (!projectData || projectData.length === 0) return []
    return [...new Set(projectData.map(item => item["Project"]))].sort()
  }, [projectData])
  
  const resources = useMemo(() => {
    if (!projectData || projectData.length === 0) return []
    return [...new Set(projectData.map(item => item["Resource Name"]))].sort()
  }, [projectData])

  // Filter project data based on selections - memoized
  const filteredProjectData = useMemo(() => {
    if (!projectData || projectData.length === 0) return []
    return projectData.filter(item => {
      const customerMatch = selectedCustomers.includes("all") || selectedCustomers.includes(item["Customer Name"])
      const projectMatch = selectedProjects.includes("all") || selectedProjects.includes(item["Project"])
      const resourceMatch = selectedResources.includes("all") || selectedResources.includes(item["Resource Name"])
      const dateMatch = item["Worked Date"] >= selectedDateRange.start && item["Worked Date"] <= selectedDateRange.end
      
      return customerMatch && projectMatch && resourceMatch && dateMatch
    })
  }, [projectData, selectedCustomers, selectedProjects, selectedResources, selectedDateRange])

  // Get revenue by month - memoized
  const getRevenueByMonth = useCallback(() => {
    const monthlyRevenue: Record<string, number> = {}
    
    filteredProjectData.forEach(item => {
      const date = new Date(item["Worked Date"])
      const monthKey = `${date.getFullYear()}-${(date.getMonth() + 1).toString().padStart(2, '0')}`
      
      if (!monthlyRevenue[monthKey]) {
        monthlyRevenue[monthKey] = 0
      }
      monthlyRevenue[monthKey] += item["Extended Price"]
    })

    return Object.entries(monthlyRevenue)
      .map(([month, revenue]) => ({ month, revenue }))
      .sort((a, b) => a.month.localeCompare(b.month))
  }, [filteredProjectData])

  // Get revenue by customer - memoized
  const getRevenueByCustomer = useCallback(() => {
    const customerRevenue: Record<string, number> = {}
    
    filteredProjectData.forEach(item => {
      const customer = item["Customer Name"]
      if (!customerRevenue[customer]) {
        customerRevenue[customer] = 0
      }
      customerRevenue[customer] += item["Extended Price"]
    })

    return Object.entries(customerRevenue)
      .map(([customer, revenue]) => ({ customer, revenue }))
      .sort((a, b) => b.revenue - a.revenue)
  }, [filteredProjectData])

  // Get revenue by project - memoized
  const getRevenueByProject = useCallback(() => {
    const projectRevenue: Record<string, number> = {}
    
    filteredProjectData.forEach(item => {
      const project = item["Project"]
      if (!projectRevenue[project]) {
        projectRevenue[project] = 0
      }
      projectRevenue[project] += item["Extended Price"]
    })

    return Object.entries(projectRevenue)
      .map(([project, revenue]) => ({ project, revenue }))
      .sort((a, b) => b.revenue - a.revenue)
  }, [filteredProjectData])

  // Get hours by resource - memoized
  const getHoursByResource = useCallback(() => {
    const resourceHours: Record<string, number> = {}
    
    filteredProjectData.forEach(item => {
      const resource = item["Resource Name"]
      if (!resourceHours[resource]) {
        resourceHours[resource] = 0
      }
      resourceHours[resource] += item["Billable Hours"]
    })

    return Object.entries(resourceHours)
      .map(([resource, hours]) => ({ resource, hours }))
      .sort((a, b) => b.hours - a.hours)
  }, [filteredProjectData])

  // Load data from API
  useEffect(() => {
    const loadData = async () => {
      try {
        setLoading(true)
        
        // Fetch project data
        const [dataResponse, statsResponse] = await Promise.all([
          fetch('http://localhost:5000/api/project-data'),
          fetch('http://localhost:5000/api/project-stats')
        ])
        
        if (!dataResponse.ok || !statsResponse.ok) {
          throw new Error('Failed to fetch project data')
        }
        
        const dataResult = await dataResponse.json()
        const statsResult = await statsResponse.json()
        
        // Flask API returns array directly, not in .data property
        setProjectData(Array.isArray(dataResult) ? dataResult : [])
        setProjectStats(statsResult)
        
      } catch (error) {
        console.error('Error loading project data:', error)
        // Set empty data on error
        setProjectData([])
        setProjectStats(null)
      } finally {
        setLoading(false)
      }
    }

    loadData()
  }, [])

  const value = {
    projectData,
    projectStats,
    selectedCustomers,
    setSelectedCustomers,
    selectedProjects,
    setSelectedProjects,
    selectedResources,
    setSelectedResources,
    selectedDateRange,
    setSelectedDateRange,
    loading,
    customers,
    projects,
    resources,
    filteredProjectData,
    formatCurrency,
    formatNumber,
    getRevenueByMonth,
    getRevenueByCustomer,
    getRevenueByProject,
    getHoursByResource,
  }

  return (
    <DashboardContext.Provider value={value}>
      {children}
    </DashboardContext.Provider>
  )
} 