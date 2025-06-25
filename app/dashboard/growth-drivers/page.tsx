"use client"

import { useState, useEffect, useMemo } from "react"
import { ArrowUpRight, TrendingUp, Target, Zap, DollarSign, Users, Calendar, BarChart3 } from "lucide-react"
import DashboardLayout from "../../components/layout/DashboardLayout"
import { useDashboard } from "../../context/DashboardContext"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  BarChart,
  Bar,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  ComposedChart,
  Area,
  AreaChart,
  Cell,
  ReferenceLine,
  ScatterChart,
  Scatter
} from "recharts"

// Style Guide for Visual Elements - A more professional and limited color palette
const PRIMARY_COLOR = "#3b82f6"; // Blue for primary metrics and revenue data
const POSITIVE_COLOR = "#10b981"; // Green for positive growth
const NEGATIVE_COLOR = "#ef4444"; // Red for negative change
const BASELINE_COLOR = "#6b7280"; // Gray for baselines

// Consistent, professional color palette for multi-category charts
const CATEGORY_COLORS = ["#3b82f6", "#14b8a6", "#f97316", "#8b5cf6", "#6b7280", "#ec4899"];

export default function GrowthDriversDashboard() {
  const { 
    formatCurrency, 
    formatNumber,
    selectedCustomers,
    setSelectedCustomers,
    selectedProjects,
    setSelectedProjects,
    selectedResources,
    setSelectedResources,
    selectedDateRange,
    customers,
    projects,
    resources,
    loading: contextLoading
  } = useDashboard()

  const [initialLoading, setInitialLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  
  // API data states
  const [growthAnalysis, setGrowthAnalysis] = useState<any>(null)
  const [categoryGrowthData, setCategoryGrowthData] = useState<any>(null)
  const [newProjectsData, setNewProjectsData] = useState<any>(null)
  const [blendedRateData, setBlendedRateData] = useState<any>(null)
  const [waterfallData, setWaterfallData] = useState<any>(null)
  
  // Interactive category drill-down states
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null)
  const [customersInCategory, setCustomersInCategory] = useState<any>(null)
  const [categoryDataLoading, setCategoryDataLoading] = useState(false)
  
  // Interactive year selection states
  const [selectedYear, setSelectedYear] = useState<string | null>(null)
  const [yearlyWaterfallData, setYearlyWaterfallData] = useState<any>(null)
  const [yearDataLoading, setYearDataLoading] = useState(false)

  // Fetch data from Flask APIs
  const fetchGrowthData = async (isInitial = false) => {
    try {
      if (isInitial) {
        setInitialLoading(true)
      } else {
        setRefreshing(true)
      }
        setError(null)

      // Build query parameters for filters
      const params = new URLSearchParams()
      
      if (selectedCustomers.length > 0 && !selectedCustomers.includes('all')) {
        params.append('customers', selectedCustomers.join(','))
      }
      
      if (selectedProjects.length > 0 && !selectedProjects.includes('all')) {
        params.append('projects', selectedProjects.join(','))
      }
      
      if (selectedResources.length > 0 && !selectedResources.includes('all')) {
        params.append('resources', selectedResources.join(','))
      }
      
      if (selectedDateRange.start) {
        params.append('startDate', selectedDateRange.start)
      }
      
      if (selectedDateRange.end) {
        params.append('endDate', selectedDateRange.end)
      }

      const queryString = params.toString()
      const baseUrl = (endpoint: string) => queryString ? `http://localhost:5000${endpoint}?${queryString}` : `http://localhost:5000${endpoint}`

      console.log('Fetching growth drivers data with params:', queryString)

        // Fetch all growth analysis data in parallel
        const [
          growthResponse,
        categoryResponse,
        newProjectsResponse,
        blendedRateResponse,
        waterfallResponse
        ] = await Promise.all([
        fetch(baseUrl('/api/growth-drivers')),
        fetch(baseUrl('/api/growth-drivers/category-growth')),
        fetch(baseUrl('/api/growth-drivers/new-projects')),
        fetch(baseUrl('/api/growth-drivers/blended-rate')),
        fetch(baseUrl('/api/growth-drivers/waterfall'))
      ])

      if (!growthResponse.ok) throw new Error(`Failed to fetch growth analysis: ${growthResponse.status}`)
      if (!categoryResponse.ok) throw new Error(`Failed to fetch category growth: ${categoryResponse.status}`)
      if (!newProjectsResponse.ok) throw new Error(`Failed to fetch new projects data: ${newProjectsResponse.status}`)
      if (!blendedRateResponse.ok) throw new Error(`Failed to fetch blended rate data: ${blendedRateResponse.status}`)
      if (!waterfallResponse.ok) throw new Error(`Failed to fetch waterfall data: ${waterfallResponse.status}`)

      const [growth, category, newProjects, blendedRate, waterfall] = await Promise.all([
        growthResponse.json(),
        categoryResponse.json(),
        newProjectsResponse.json(),
        blendedRateResponse.json(),
        waterfallResponse.json()
      ])

      console.log('Fetched growth drivers data:', { growth, category, newProjects, blendedRate, waterfall })

      setGrowthAnalysis(growth)
      setCategoryGrowthData(category)
      setNewProjectsData(newProjects)
      setBlendedRateData(blendedRate)
      setWaterfallData(waterfall)

    } catch (err) {
      console.error('Error fetching growth drivers data:', err)
      setError(err instanceof Error ? err.message : 'An error occurred')
    } finally {
      setInitialLoading(false)
      setRefreshing(false)
    }
  }

  // Fetch customers within a specific category
  const fetchCustomersInCategory = async (categoryName: string) => {
    try {
      setCategoryDataLoading(true)
      
      // Build query parameters for filters
      const params = new URLSearchParams()
      
      if (selectedCustomers.length > 0 && !selectedCustomers.includes('all')) {
        params.append('customers', selectedCustomers.join(','))
      }
      
      if (selectedProjects.length > 0 && !selectedProjects.includes('all')) {
        params.append('projects', selectedProjects.join(','))
      }
      
      if (selectedResources.length > 0 && !selectedResources.includes('all')) {
        params.append('resources', selectedResources.join(','))
      }
      
      if (selectedDateRange.start) {
        params.append('startDate', selectedDateRange.start)
      }
      
      if (selectedDateRange.end) {
        params.append('endDate', selectedDateRange.end)
      }
      
      // Add category parameter
      params.append('category', categoryName)

      const queryString = params.toString()
      const url = `http://localhost:5000/api/growth-drivers/customers-in-category?${queryString}`

      console.log('Fetching customers in category:', categoryName, 'URL:', url)

      const response = await fetch(url)
      if (!response.ok) {
        const errorText = await response.text()
        console.error('API Error Response:', response.status, errorText)
        throw new Error(`Failed to fetch customers in category ${categoryName}: ${response.status} - ${errorText}`)
      }
      
      const data = await response.json()
      console.log('Customers in category response for', categoryName, ':', data)
      
      // Validate data structure
      if (!data || !data.customerData || !Array.isArray(data.customerData)) {
        console.error('Invalid customers in category data structure:', data)
        throw new Error(`Invalid data structure received for category ${categoryName}`)
      }
      
      if (data.customerData.length === 0) {
        console.warn('No customer data available for category', categoryName)
      }
      
      setCustomersInCategory(data)
      setSelectedCategory(categoryName)
      
    } catch (err) {
      console.error('Error fetching customers in category:', err)
      setError(err instanceof Error ? err.message : 'An error occurred')
      // Reset states on error
      setCustomersInCategory(null)
      setSelectedCategory(null)
    } finally {
      setCategoryDataLoading(false)
    }
  }

  // Fetch detailed waterfall data for a specific year
  const fetchYearlyWaterfallData = async (year: string) => {
    try {
      setYearDataLoading(true)
      
      // Build query parameters for filters
      const params = new URLSearchParams()
      
      if (selectedCustomers.length > 0 && !selectedCustomers.includes('all')) {
        params.append('customers', selectedCustomers.join(','))
      }
      
      if (selectedProjects.length > 0 && !selectedProjects.includes('all')) {
        params.append('projects', selectedProjects.join(','))
      }
      
      if (selectedResources.length > 0 && !selectedResources.includes('all')) {
        params.append('resources', selectedResources.join(','))
      }
      
      if (selectedDateRange.start) {
        params.append('startDate', selectedDateRange.start)
      }
      
      if (selectedDateRange.end) {
        params.append('endDate', selectedDateRange.end)
      }
      
      // Add year parameter
      params.append('year', year)

      const queryString = params.toString()
      const url = `http://localhost:5000/api/growth-drivers/yearly-waterfall?${queryString}`

      console.log('Fetching yearly waterfall data for year:', year, 'URL:', url)

      const response = await fetch(url)
      if (!response.ok) {
        const errorText = await response.text()
        console.error('API Error Response:', response.status, errorText)
        throw new Error(`Failed to fetch yearly waterfall data for ${year}: ${response.status} - ${errorText}`)
      }
      
      const data = await response.json()
      console.log('Yearly waterfall response for', year, ':', data)
      
      // Validate data structure
      if (!data || !data.waterfallData || !Array.isArray(data.waterfallData)) {
        console.error('Invalid yearly waterfall data structure:', data)
        throw new Error(`Invalid data structure received for year ${year}`)
      }
      
      if (data.waterfallData.length === 0) {
        console.warn('No waterfall data available for year', year)
      }
      
      setYearlyWaterfallData(data)
      setSelectedYear(year)

      } catch (err) {
      console.error('Error fetching yearly waterfall data:', err)
        setError(err instanceof Error ? err.message : 'An error occurred')
      // Reset states on error
      setYearlyWaterfallData(null)
      setSelectedYear(null)
      } finally {
      setYearDataLoading(false)
    }
  }

  // Handle category bar click
  const handleCategoryClick = (data: any) => {
    const categoryName = data.name || data.category
    
    if (selectedCategory === categoryName) {
      // If clicking the same category, go back to category view
      setSelectedCategory(null)
      setCustomersInCategory(null)
    } else {
      // Fetch customers within the clicked category
      fetchCustomersInCategory(categoryName)
    }
  }

  // Handle annual revenue bar click
  const handleYearClick = (data: any) => {
    const year = data.year?.toString()
    
    if (selectedYear === year) {
      // If clicking the same year, go back to annual view
      setSelectedYear(null)
      setYearlyWaterfallData(null)
    } else {
      // Fetch detailed waterfall data for the clicked year
      fetchYearlyWaterfallData(year)
    }
  }

  // Fetch data when component mounts or filters change
  useEffect(() => {
    if (!contextLoading) {
      // Only show full loading screen on initial load
      const isInitialLoad = growthAnalysis === null
      fetchGrowthData(isInitialLoad)
    }
  }, [contextLoading, selectedCustomers, selectedProjects, selectedResources, selectedDateRange])

  // Calculate KPIs exactly as specified in requirements
  const growthKPIs = useMemo(() => {
    if (!growthAnalysis?.annualGrowthData) {
      return {
        currentYearRevenue: 0,
        yoyGrowthRate: 0,
        revenueByCategoryTotal: 0,
        newProjectsContribution: 0,
        revenuePerBillableHour: 0
      }
    }

    const annualData = growthAnalysis.annualGrowthData
    const currentYear = annualData[annualData.length - 1]
    const previousYear = annualData[annualData.length - 2]

    // 1. Annual Revenue (current year)
    const currentYearRevenue = currentYear?.revenue || 0

    // 2. Year-over-Year Growth Rate
    const yoyGrowthRate = currentYear?.yoyGrowthRate || 0

    // 3. Revenue by Customer Category (total)
    const revenueByCategoryTotal = categoryGrowthData?.categoryTotals?.length > 0 ?
      categoryGrowthData.categoryTotals.reduce((sum: number, cat: any) => sum + cat.revenue, 0) : 0

    // 4. Contribution of New Projects to YoY Growth
    const newProjectsContribution = newProjectsData?.newProjectsRevenue || 0

    // 5. Revenue per Billable Hour (Blended Rate) - current rate
    const revenuePerBillableHour = blendedRateData?.currentBlendedRate || 0

    return {
      currentYearRevenue,
      yoyGrowthRate,
      revenueByCategoryTotal,
      newProjectsContribution,
      revenuePerBillableHour
    }
  }, [growthAnalysis, categoryGrowthData, newProjectsData, blendedRateData])

  // Specific currency formatter for waterfall chart to handle negative values correctly
  const formatWaterfallCurrency = (value: number) => {
    if (typeof value !== 'number') return '$0';
    const sign = value < 0 ? '-' : '';
    const absValue = Math.abs(value);
    if (absValue >= 1000000) {
      return `${sign}$${(absValue / 1000000).toFixed(1)}M`;
    }
    if (absValue >= 1000) {
      return `${sign}$${(absValue / 1000).toFixed(1)}K`;
    }
    return `${sign}$${absValue.toFixed(0)}`;
  };

  // Custom tooltip for annual growth chart
  const CustomGrowthTooltip = ({ active, payload, label }: any) => {
    if (active && payload && payload.length) {
      const data = payload[0].payload
      return (
        <div className="bg-white p-3 border rounded shadow-lg">
          <p className="font-semibold">{label}</p>
          <p className="text-blue-600">Revenue: {formatCurrency(data.revenue)}</p>
          <p className="text-green-600">YoY Growth: {data.yoyGrowthRate > 0 ? '+' : ''}{data.yoyGrowthRate.toFixed(1)}%</p>
          <p className="text-gray-600">Hours: {formatNumber(data.hours)}</p>
          <p className="text-xs text-gray-500 mt-2">Click to see revenue bridge breakdown</p>
        </div>
      )
    }
    return null
  }

  // Custom tooltip for category growth chart
  const CustomCategoryTooltip = ({ active, payload, label }: any) => {
    if (active && payload && payload.length) {
      return (
        <div className="bg-white p-3 border rounded shadow-lg">
          <p className="font-semibold">Year: {label}</p>
          {payload.map((entry: any, index: number) => {
            // Convert back to full category name for tooltip
            const fullCategoryName = entry.dataKey
              .replace(/_/g, ' ')
              .replace(/and/g, '&')
              .replace('Commercial Corporate', 'Commercial/Corporate')
              .replace('Education Sector', 'Education Sector')
              .replace('Government Municipality', 'Government/Municipality')
              .replace('Health and Community Services', 'Health & Community Services')
              .replace('Technology and IT', 'Technology & IT')
            
            return (
              <p key={index} style={{ color: entry.color }}>
                {fullCategoryName}: {formatCurrency(entry.value)}
              </p>
            )
          })}
          <p className="text-xs text-gray-500 mt-2">Click on any area to drill down</p>
        </div>
      )
    }
    return null
  }

  // Custom tooltip for waterfall chart
  const CustomWaterfallTooltip = ({ active, payload, label }: any) => {
    if (active && payload && payload.length) {
      const data = payload[0].payload
      return (
        <div className="bg-white p-3 border rounded shadow-lg">
          <p className="font-semibold">{data.name}</p>
          <p className={`${data.value >= 0 ? 'text-green-600' : 'text-red-600'}`}>
            {data.type === 'total' ? 'Total: ' : 'Change: '}
            {data.value >= 0 ? '+' : ''}{formatWaterfallCurrency(data.value)}
          </p>
          {data.description && <p className="text-gray-600 text-sm">{data.description}</p>}
        </div>
      )
    }
    return null
  }

  // Custom tooltip for blended rate chart
  const CustomBlendedRateTooltip = ({ active, payload, label }: any) => {
    if (active && payload && payload.length) {
      const data = payload[0].payload
      return (
        <div className="bg-white p-3 border rounded shadow-lg">
          <p className="font-semibold">{label}</p>
          <p className="text-blue-600">Blended Rate: {formatCurrency(data.blendedRate)}/hr</p>
          <p className="text-gray-600">Total Revenue: {formatCurrency(data.totalRevenue)}</p>
          <p className="text-gray-600">Total Hours: {formatNumber(data.totalHours)}</p>
        </div>
      )
    }
    return null
  }

  // Loading state - only show full screen loading on initial load
  if (contextLoading || initialLoading) {
    return (
      <DashboardLayout
        selectedCustomers={selectedCustomers}
        setSelectedCustomers={setSelectedCustomers}
        selectedProjects={selectedProjects}
        setSelectedProjects={setSelectedProjects}
        selectedResources={selectedResources}
        setSelectedResources={setSelectedResources}
        activeTab="growth-drivers"
        customers={customers}
        projects={projects}
        resources={resources}
      >
        <div className="flex items-center justify-center h-64">
          <div className="text-lg">Loading growth drivers analysis...</div>
        </div>
      </DashboardLayout>
    )
  }

  // Error state
  if (error) {
    return (
      <DashboardLayout
        selectedCustomers={selectedCustomers}
        setSelectedCustomers={setSelectedCustomers}
        selectedProjects={selectedProjects}
        setSelectedProjects={setSelectedProjects}
        selectedResources={selectedResources}
        setSelectedResources={setSelectedResources}
        activeTab="growth-drivers"
        customers={customers}
        projects={projects}
        resources={resources}
      >
        <div className="flex items-center justify-center h-64">
          <div className="text-lg text-red-600">Error: {error}</div>
        </div>
      </DashboardLayout>
    )
  }

  return (
    <DashboardLayout
      selectedCustomers={selectedCustomers}
      setSelectedCustomers={setSelectedCustomers}
      selectedProjects={selectedProjects}
      setSelectedProjects={setSelectedProjects}
      selectedResources={selectedResources}
      setSelectedResources={setSelectedResources}
      activeTab="growth-drivers"
      customers={customers}
      projects={projects}
      resources={resources}
    >

      {/* Key Performance Indicators - Exactly as specified in requirements */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4 mb-6">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Current Year Revenue</CardTitle>
            <DollarSign className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {formatCurrency(growthKPIs.currentYearRevenue)}
            </div>
            <p className="text-xs text-muted-foreground">
              Annual revenue this year
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">YoY Growth Rate</CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {growthKPIs.yoyGrowthRate > 0 ? '+' : ''}{growthKPIs.yoyGrowthRate.toFixed(1)}%
            </div>
            <p className="text-xs text-muted-foreground">
              Year-over-year growth
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Category Revenue Total</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {formatCurrency(growthKPIs.revenueByCategoryTotal)}
            </div>
            <p className="text-xs text-muted-foreground">
              All customer categories
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">New Projects Revenue</CardTitle>
            <Target className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {formatCurrency(growthKPIs.newProjectsContribution)}
            </div>
            <p className="text-xs text-muted-foreground">
              Contribution to growth
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Blended Rate</CardTitle>
            <BarChart3 className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {formatCurrency(growthKPIs.revenuePerBillableHour)}
            </div>
            <p className="text-xs text-muted-foreground">
              Revenue per billable hour
            </p>
          </CardContent>
        </Card>
          </div>

      {/* Main Visualizations - Adhering to visual hierarchy */}
      <div className={`grid grid-cols-1 lg:grid-cols-3 gap-6 mb-6 transition-opacity duration-300 ${refreshing ? 'opacity-75' : 'opacity-100'}`}>
        {/* Combination Chart: Annual Revenue and YoY Growth */}
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <TrendingUp className="w-5 h-5" />
              Annual Revenue & YoY Growth Rate
            </CardTitle>
            <CardDescription>
              Annual revenue bars with year-over-year growth rate line (click on any year to see revenue bridge)
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <ComposedChart data={growthAnalysis?.annualGrowthData || []}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="year" />
                  <YAxis yAxisId="left" tickFormatter={(value) => formatCurrency(value)} />
                  <YAxis yAxisId="right" orientation="right" tickFormatter={(value) => `${value}%`} />
                  <Tooltip content={<CustomGrowthTooltip />} />
                  <Legend />
                
                <Bar 
                  yAxisId="left" 
                  dataKey="revenue" 
                  name="Annual Revenue" 
                  fill={PRIMARY_COLOR}
                  onClick={handleYearClick}
                  style={{ cursor: 'pointer' }}
                />
                  <Line 
                    yAxisId="right" 
                    type="monotone" 
                    dataKey="yoyGrowthRate" 
                    stroke={POSITIVE_COLOR}
                    strokeWidth={3}
                    name="YoY Growth Rate (%)"
                  />
                </ComposedChart>
              </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* Waterfall Chart: Year-over-Year Revenue Bridge or Yearly Detail */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <BarChart3 className="w-5 h-5" />
              {selectedYear ? `${selectedYear} Revenue Bridge Detail` : 'Year-over-Year Revenue Bridge'}
              {selectedYear && (
                <button 
                  onClick={() => {
                    setSelectedYear(null)
                    setYearlyWaterfallData(null)
                  }}
                  className="ml-2 px-2 py-1 text-xs bg-gray-200 hover:bg-gray-300 rounded"
                >
                  ← Back to Summary
                </button>
              )}
            </CardTitle>
            <CardDescription>
              {selectedYear 
                ? `Detailed revenue bridge breakdown for ${selectedYear}` 
                : 'How revenue moved from previous year to current year'
              }
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="relative">
              {yearDataLoading && (
                <div className="absolute inset-0 bg-white/50 flex items-center justify-center z-10 rounded">
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <div className="animate-spin h-4 w-4 border-2 border-blue-500 border-t-transparent rounded-full"></div>
                    Loading {selectedYear} details...
                  </div>
                </div>
              )}
              {selectedYear && (!yearlyWaterfallData?.waterfallData || yearlyWaterfallData.waterfallData.length === 0) ? (
                <div className="flex items-center justify-center h-[300px] text-muted-foreground">
                  <div className="text-center">
                    <p className="text-lg">No detailed waterfall data available for {selectedYear}</p>
                    <p className="text-sm mt-2">The API endpoint may not be implemented or there's no data for this year.</p>
                    <Button 
                      variant="outline" 
                      size="sm" 
                      className="mt-4"
                      onClick={() => {
                        setSelectedYear(null)
                        setYearlyWaterfallData(null)
                      }}
                    >
                      ← Back to Summary
                    </Button>
                  </div>
                </div>
              ) : (
                <ResponsiveContainer width="100%" height={300}>
                  <BarChart data={selectedYear ? yearlyWaterfallData?.waterfallData || [] : waterfallData?.waterfallData || []}>
                  <CartesianGrid strokeDasharray="3 3" />
                    <XAxis 
                      dataKey="name" 
                      angle={-45}
                      textAnchor="end"
                      height={80}
                      fontSize={11}
                    />
                    <YAxis tickFormatter={(value) => formatWaterfallCurrency(value)} />
                    <Tooltip content={<CustomWaterfallTooltip />} />
                    
                    <Bar dataKey="value" name="Revenue Change">
                      {(selectedYear ? yearlyWaterfallData?.waterfallData || [] : waterfallData?.waterfallData || []).map((entry: any, index: number) => (
                        <Cell 
                          key={`waterfall-cell-${index}`} 
                          fill={entry.type === 'total' ? PRIMARY_COLOR : (entry.value >= 0 ? POSITIVE_COLOR : NEGATIVE_COLOR)} 
                        />
                      ))}
                    </Bar>
                  </BarChart>
              </ResponsiveContainer>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Growth Decomposition Section */}
      <div className="mt-10 mb-6">
        <h2 className="text-2xl font-bold tracking-tight">Growth Decomposition</h2>
        <p className="text-muted-foreground">
          Detailed breakdown of revenue sources and efficiency metrics over time.
        </p>
      </div>

      <div className={`grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6 transition-opacity duration-300 ${refreshing ? 'opacity-75' : 'opacity-100'}`}>
        {/* Stacked Area Chart: Revenue by Customer Category Over Time */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Users className="w-5 h-5" />
              {selectedCategory 
                ? `Top 5 Customers in ${selectedCategory}`
                : 'Revenue by Customer Category Over Time'
              }
              {selectedCategory && (
                <button 
                  onClick={() => {
                    setSelectedCategory(null)
                    setCustomersInCategory(null)
                  }}
                  className="ml-2 px-2 py-1 text-xs bg-gray-200 hover:bg-gray-300 rounded"
                >
                  ← Back to Categories
                </button>
              )}
            </CardTitle>
            <CardDescription>
              {selectedCategory 
                ? `Top performing customers in ${selectedCategory} category`
                : 'Revenue trends across different customer categories (click on any area to drill down)'
              }
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="relative">
              {categoryDataLoading && (
                <div className="absolute inset-0 bg-white/50 flex items-center justify-center z-10 rounded">
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <div className="animate-spin h-4 w-4 border-2 border-blue-500 border-t-transparent rounded-full"></div>
                    Loading {selectedCategory} customers...
                  </div>
                </div>
              )}
              {selectedCategory && (!customersInCategory?.customerData || customersInCategory.customerData.length === 0) ? (
                <div className="flex items-center justify-center h-[300px] text-muted-foreground">
                  <div className="text-center">
                    <p className="text-lg">No customers found in {selectedCategory}</p>
                    <p className="text-sm mt-2">This category may not have any customers in the selected time period.</p>
                    <Button 
                      variant="outline" 
                      size="sm" 
                      className="mt-4"
                      onClick={() => {
                        setSelectedCategory(null)
                        setCustomersInCategory(null)
                      }}
                    >
                      ← Back to Categories
                    </Button>
                  </div>
                </div>
              ) : selectedCategory ? (
                <ResponsiveContainer width="100%" height={300}>
                  <BarChart data={customersInCategory?.customerData || []}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis 
                    dataKey="customer" 
                    angle={-45}
                    textAnchor="end"
                      height={80}
                      fontSize={11}
                  />
                  <YAxis tickFormatter={(value) => formatCurrency(value)} />
                  <Tooltip 
                      formatter={(value: any) => [formatCurrency(value), "Revenue"]}
                      labelFormatter={(label) => `Customer: ${label}`}
                    />
                    <Bar dataKey="revenue" fill={PRIMARY_COLOR} />
                </BarChart>
              </ResponsiveContainer>
              ) : (
                <ResponsiveContainer width="100%" height={300}>
                  <AreaChart data={categoryGrowthData?.categoryGrowthOverTime || []}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="year" />
                    <YAxis tickFormatter={(value) => formatCurrency(value)} />
                    <Tooltip content={<CustomCategoryTooltip />} />
                    <Legend />
                    
                    {categoryGrowthData?.categories?.map((category: string, index: number) => {
                      const cleanKey = category.replace(/\//g, '_').replace(/\s/g, '_').replace(/-/g, '_').replace(/&/g, 'and')
                      
                      // Create short names for legend
                      const shortName = category
                        .replace('Commercial/Corporate', 'Commercial')
                        .replace('Education Sector', 'Education')
                        .replace('Government/Municipality', 'Government')
                        .replace('Health & Community Services', 'Health & Community')
                        .replace('Technology & IT', 'Technology')
                        .replace('Other', 'Other')
                      
                      return (
                        <Area
                          key={category}
                          type="monotone"
                          dataKey={cleanKey}
                          stackId="1"
                          stroke={CATEGORY_COLORS[index % CATEGORY_COLORS.length]}
                          fill={CATEGORY_COLORS[index % CATEGORY_COLORS.length]}
                          name={shortName}
                          onClick={() => handleCategoryClick({ name: category })}
                          style={{ cursor: 'pointer' }}
                        />
                      )
                    })}
                  </AreaChart>
                </ResponsiveContainer>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Line Chart: Revenue per Billable Hour Over Time */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <DollarSign className="w-5 h-5" />
              Revenue per Billable Hour Over Time
            </CardTitle>
            <CardDescription>
              Blended rate trends indicating shift to higher-value work
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <LineChart data={blendedRateData?.blendedRateOverTime || []}>
                  <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="period" />
                <YAxis tickFormatter={(value) => formatCurrency(value)} />
                <Tooltip content={<CustomBlendedRateTooltip />} />
                <Legend />
                
                <Line 
                  type="monotone" 
                  dataKey="blendedRate" 
                  stroke={PRIMARY_COLOR}
                  strokeWidth={3}
                  name="Blended Rate ($/hr)"
                  dot={{ fill: PRIMARY_COLOR, strokeWidth: 2, r: 6 }}
                />
              </LineChart>
              </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      {/* Additional Insights Section */}
      {newProjectsData?.topNewProjects && (
        <Card className={`transition-opacity duration-300 ${refreshing ? 'opacity-75' : 'opacity-100'}`}>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Target className="w-5 h-5" />
              Top New Growth-Driving Projects
            </CardTitle>
            <CardDescription>
              New projects launched recently that are contributing most to growth
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {newProjectsData.topNewProjects.slice(0, 6).map((project: any, index: number) => (
                <div key={index} className="p-4 border rounded-lg">
                  <div className="flex items-center gap-2 mb-2">
                    <Zap className="w-5 h-5 text-green-500" />
                    <div className="font-semibold text-sm">{project.project}</div>
                </div>
                  <div className="space-y-1 text-sm">
                    <div>Customer: <span className="font-medium">{project.customer}</span></div>
                    <div>Revenue: <span className="font-medium">{formatCurrency(project.revenue)}</span></div>
                    <div>Hours: <span className="font-medium">{formatNumber(project.hours)}</span></div>
                    <div className="text-green-600 font-semibold">
                      Started: {project.startDate}
                </div>
              </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </DashboardLayout>
  )
} 