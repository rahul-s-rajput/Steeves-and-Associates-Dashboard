"use client"

import { MultiSelect } from "@/components/ui/multi-select"
import { useState } from "react"
import { useDashboard } from "../../context/DashboardContext"

interface FilterBarProps {
  selectedCustomers: string[]
  setSelectedCustomers: (customers: string[]) => void
  selectedProjects: string[]
  setSelectedProjects: (projects: string[]) => void
  selectedResources: string[]
  setSelectedResources: (resources: string[]) => void
  customers: string[]
  projects: string[]
  resources: string[]
  activeTab: string
  selectedDateRange: { start: string; end: string }
  setSelectedDateRange: (range: { start: string; end: string }) => void
}

export default function FilterBar({
  selectedCustomers,
  setSelectedCustomers,
  selectedProjects,
  setSelectedProjects,
  selectedResources,
  setSelectedResources,
  customers,
  projects,
  resources,
  activeTab,
  selectedDateRange,
  setSelectedDateRange,
}: FilterBarProps) {
  let title = "Project Dashboard"
  
  switch(activeTab) {
    case "dashboard":
      title = "Project Revenue Dashboard"
      break
    case "seasonal-analysis":
      title = "Seasonal Analysis Dashboard"
      break
    case "growth-drivers":
      title = "Growth Drivers Dashboard"
      break
    case "resource-performance":
      title = "Resource Performance Dashboard"
      break
    case "project-analytics":
      title = "Project Analytics Dashboard"
      break
    case "forecasting":
      title = "Forecasting Dashboard"
      break
    case "chatbot":
      title = "Chatbot"
      break
    default:
      title = "Project Dashboard"
      break
  }

  // Handle customer selection
  const handleCustomerChange = (values: string[]) => {
    if (values.includes("all") && values.length > 1) {
      if (selectedCustomers.includes("all")) {
        setSelectedCustomers(values.filter(v => v !== "all"))
      } else {
        setSelectedCustomers(["all"])
      }
    } else if (values.length === 0) {
      setSelectedCustomers(["all"])
    } else {
      setSelectedCustomers(values)
    }
  }

  // Handle project selection
  const handleProjectChange = (values: string[]) => {
    if (values.includes("all") && values.length > 1) {
      if (selectedProjects.includes("all")) {
        setSelectedProjects(values.filter(v => v !== "all"))
      } else {
        setSelectedProjects(["all"])
      }
    } else if (values.length === 0) {
      setSelectedProjects(["all"])
    } else {
      setSelectedProjects(values)
    }
  }

  // Handle resource selection
  const handleResourceChange = (values: string[]) => {
    if (values.includes("all") && values.length > 1) {
      if (selectedResources.includes("all")) {
        setSelectedResources(values.filter(v => v !== "all"))
      } else {
        setSelectedResources(["all"])
      }
    } else if (values.length === 0) {
      setSelectedResources(["all"])
    } else {
      setSelectedResources(values)
    }
  }

  // Handle date range changes
  const handleStartDateChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    setSelectedDateRange({
      ...selectedDateRange,
      start: event.target.value
    })
  }

  const handleEndDateChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    setSelectedDateRange({
      ...selectedDateRange,
      end: event.target.value
    })
  }

  // Format display text for selections
  const getCustomerDisplayText = () => {
    if (selectedCustomers.includes("all")) return "All Customers"
    if (selectedCustomers.length === 1) return selectedCustomers[0]
    return `${selectedCustomers.length} Customers Selected`
  }

  const getProjectDisplayText = () => {
    if (selectedProjects.includes("all")) return "All Projects"
    if (selectedProjects.length === 1) return selectedProjects[0]
    return `${selectedProjects.length} Projects Selected`
  }

  const getResourceDisplayText = () => {
    if (selectedResources.includes("all")) return "All Resources"
    if (selectedResources.length === 1) return selectedResources[0]
    return `${selectedResources.length} Resources Selected`
  }

  return (
    <div className="mb-4">
      <div className="flex items-center justify-between mb-2">
        {/* <h1 className="text-xl font-semibold">{title}</h1> */}
        <div className="flex items-center gap-4">
          <MultiSelect
            options={[{ value: "all", label: "All Customers" }, ...customers.map(customer => ({ value: customer, label: customer }))]}
            selectedValues={selectedCustomers}
            onChange={handleCustomerChange}
            placeholder="Select Customers"
            displayText={getCustomerDisplayText()}
          />

          <MultiSelect
            options={[{ value: "all", label: "All Projects" }, ...projects.map(project => ({ value: project, label: project }))]}
            selectedValues={selectedProjects}
            onChange={handleProjectChange}
            placeholder="Select Projects"
            displayText={getProjectDisplayText()}
          />

          <MultiSelect
            options={[{ value: "all", label: "All Resources" }, ...resources.map(resource => ({ value: resource, label: resource }))]}
            selectedValues={selectedResources}
            onChange={handleResourceChange}
            placeholder="Select Resources"
            displayText={getResourceDisplayText()}
          />

          <div className="flex items-center gap-2">
            <label className="text-sm font-medium">From:</label>
            <input
              type="date"
              value={selectedDateRange.start}
              onChange={handleStartDateChange}
              className="px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <div className="flex items-center gap-2">
            <label className="text-sm font-medium">To:</label>
            <input
              type="date"
              value={selectedDateRange.end}
              onChange={handleEndDateChange}
              className="px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
        </div>
      </div>
    </div>
  )
} 