"use client"

import { useState, useEffect, useMemo } from "react"
import { Calendar, TrendingUp, TrendingDown, ArrowUpRight, ArrowDownRight, AlertTriangle, Target, Users, DollarSign } from "lucide-react"
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
} from "recharts"

// Style Guide for Visual Elements - A more professional and limited color palette
const PRIMARY_COLOR = "#3b82f6"; // Blue for primary metrics and revenue data
const POSITIVE_COLOR = "#10b981"; // Green for positive growth
const NEGATIVE_COLOR = "#ef4444"; // Red for low seasons, negative growth
const BASELINE_COLOR = "#6b7280"; // Gray for baselines

export default function SeasonalAnalysisDashboard() {
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
    setSelectedDateRange,
    customers,
    projects,
    resources,
    loading: contextLoading
  } = useDashboard()

  const [initialLoading, setInitialLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  
  // API data states
  const [seasonalAnalysis, setSeasonalAnalysis] = useState<any>(null)
  const [customerPerformanceData, setCustomerPerformanceData] = useState<any>(null)
  const [topProjectsData, setTopProjectsData] = useState<any>(null)
  const [yoyGrowthData, setYoyGrowthData] = useState<any>(null)
  
  // Interactive month selection states
  const [selectedMonth, setSelectedMonth] = useState<string | null>(null)
  const [yearlyDataForMonth, setYearlyDataForMonth] = useState<any>(null)
  const [monthDataLoading, setMonthDataLoading] = useState(false)
  
  // Customer category drill-down states
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null)
  const [customersInCategory, setCustomersInCategory] = useState<any>(null)
  const [categoryDataLoading, setCategoryDataLoading] = useState(false)

  // Fetch data from Flask APIs
  const fetchSeasonalData = async (isInitial = false) => {
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

      console.log('Fetching seasonal data with params:', queryString)

      // Fetch all seasonal analysis data in parallel
      const [
        seasonalResponse,
        customerResponse,
        projectsResponse,
        yoyResponse
      ] = await Promise.all([
        fetch(baseUrl('/api/seasonal-analysis')),
        fetch(baseUrl('/api/seasonal-analysis/customer-performance')),
        fetch(baseUrl('/api/seasonal-analysis/top-projects')),
        fetch(baseUrl('/api/seasonal-analysis/yoy-growth'))
      ])

      if (!seasonalResponse.ok) throw new Error(`Failed to fetch seasonal analysis: ${seasonalResponse.status}`)
      if (!customerResponse.ok) throw new Error(`Failed to fetch customer performance: ${customerResponse.status}`)
      if (!projectsResponse.ok) throw new Error(`Failed to fetch projects data: ${projectsResponse.status}`)
      if (!yoyResponse.ok) throw new Error(`Failed to fetch YoY growth data: ${yoyResponse.status}`)

      const [seasonal, customer, projects, yoy] = await Promise.all([
        seasonalResponse.json(),
        customerResponse.json(),
        projectsResponse.json(),
        yoyResponse.json()
      ])

      console.log('Fetched seasonal data:', { seasonal, customer, projects, yoy })

      setSeasonalAnalysis(seasonal)
      setCustomerPerformanceData(customer)
      setTopProjectsData(projects)
      setYoyGrowthData(yoy)


      


    } catch (err) {
      console.error('Error fetching seasonal data:', err)
      setError(err instanceof Error ? err.message : 'An error occurred')
    } finally {
      setInitialLoading(false)
      setRefreshing(false)
    }
  }

  // Fetch yearly data for a specific month
  const fetchYearlyDataForMonth = async (monthName: string) => {
    try {
      setMonthDataLoading(true)
      
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
      
      // Add month parameter
      params.append('month', monthName)

      const queryString = params.toString()
      const url = `http://localhost:5000/api/seasonal-analysis/yearly-month-data?${queryString}`

      console.log('Fetching yearly data for month:', monthName, 'URL:', url)

      const response = await fetch(url)
      if (!response.ok) {
        const errorText = await response.text()
        console.error('API Error Response:', response.status, errorText)
        throw new Error(`Failed to fetch yearly data for ${monthName}: ${response.status} - ${errorText}`)
      }
      
      const data = await response.json()
      console.log('Yearly data response for', monthName, ':', data)
      console.log('Yearly data array length:', data?.yearlyData?.length)
      console.log('First few items:', data?.yearlyData?.slice(0, 3))
      
      // Validate data structure
      if (!data || !data.yearlyData || !Array.isArray(data.yearlyData)) {
        console.error('Invalid yearly data structure:', data)
        console.error('Expected: { yearlyData: Array }, Got:', typeof data, data)
        throw new Error(`Invalid data structure received for ${monthName}`)
      }
      
      if (data.yearlyData.length === 0) {
        console.warn('No yearly data available for', monthName)
        console.warn('This might be because:')
        console.warn('1. No data exists for this month in any year')
        console.warn('2. All data was filtered out by current filters')
        console.warn('3. Month parameter parsing failed')
      }
      
      setYearlyDataForMonth(data)
      setSelectedMonth(monthName)
      
    } catch (err) {
      console.error('Error fetching yearly data for month:', err)
      setError(err instanceof Error ? err.message : 'An error occurred')
      // Reset states on error to prevent showing empty chart
      setYearlyDataForMonth(null)
      setSelectedMonth(null)
    } finally {
      setMonthDataLoading(false)
    }
  }

  // Fetch customers within a specific category for low season
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
      const url = `http://localhost:5000/api/seasonal-analysis/customers-in-category?${queryString}`

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

  // Handle month click
  const handleMonthClick = (data: any) => {
    // Extract just the month name from fullMonth (e.g., "February 2024" -> "February")
    const monthName = data.fullMonth ? data.fullMonth.split(' ')[0] : data.month
    
    if (selectedMonth === monthName) {
      // If clicking the same month, go back to monthly view
      setSelectedMonth(null)
      setYearlyDataForMonth(null)
    } else {
      // Fetch yearly data for the clicked month (just the month name)
      fetchYearlyDataForMonth(monthName)
    }
  }

  // Handle category bar click
  const handleCategoryClick = (data: any) => {
    const categoryName = data.name
    
    if (selectedCategory === categoryName) {
      // If clicking the same category, go back to category view
      setSelectedCategory(null)
      setCustomersInCategory(null)
    } else {
      // Fetch customers within the clicked category
      fetchCustomersInCategory(categoryName)
    }
  }

  // Fetch data when component mounts or filters change
  useEffect(() => {
    if (!contextLoading) {
      // Only show full loading screen on initial load
      const isInitialLoad = seasonalAnalysis === null
      fetchSeasonalData(isInitialLoad)
    }
  }, [contextLoading, selectedCustomers, selectedProjects, selectedResources, selectedDateRange])

  // Calculate KPIs exactly as specified in requirements
  const seasonalKPIs = useMemo(() => {
    if (!seasonalAnalysis?.monthlyChartData) {
      return {
        averageMonthlyRevenue: 0,
        yoyMonthlyGrowthRate: 0,
        lowSeasonCustomerRevenue: 0,
        topLowSeasonProjectsRevenue: 0
      }
    }

    const monthlyData = seasonalAnalysis.monthlyChartData

    // 1. Rolling 12-Month Average Revenue - average of the most recent 12 months
    const sortedMonthlyData = [...monthlyData].sort((a, b) => {
      // Assuming the data has a date field or we can parse fullMonth
      const dateA = new Date(a.fullMonth || `${a.month} 2024`)
      const dateB = new Date(b.fullMonth || `${b.month} 2024`)
      return dateB.getTime() - dateA.getTime() // Most recent first
    })
    const last12Months = sortedMonthlyData.slice(0, 12)
    const averageMonthlyRevenue = last12Months.length > 0 ? 
      last12Months.reduce((sum: number, month: any) => sum + month.revenue, 0) / last12Months.length : 0

    // 2. YoY Monthly Growth Rate - average from YoY data
    const yoyMonthlyGrowthRate = yoyGrowthData?.yoyGrowthData?.length > 0 ? 
      yoyGrowthData.yoyGrowthData.reduce((sum: number, month: any) => sum + month.growthRate, 0) / yoyGrowthData.yoyGrowthData.length : 0

    // 3. Revenue Contribution by Customer Category (Low Season) - sum from customer data
    const lowSeasonCustomerRevenue = customerPerformanceData?.treeMapData?.length > 0 ?
      customerPerformanceData.treeMapData.reduce((sum: number, customer: any) => sum + customer.value, 0) : 0

    // 4. Top 5 Revenue-Generating Projects (Low Season) - sum from top projects
    const topLowSeasonProjectsRevenue = topProjectsData?.topProjects?.length > 0 ?
      topProjectsData.topProjects.slice(0, 5).reduce((sum: number, project: any) => sum + project.revenue, 0) : 0

    return {
      averageMonthlyRevenue,
      yoyMonthlyGrowthRate,
      lowSeasonCustomerRevenue,
      topLowSeasonProjectsRevenue
    }
  }, [seasonalAnalysis, yoyGrowthData, customerPerformanceData, topProjectsData])

  // Calculate baseline for line chart
  const monthlyRevenueBaseline = useMemo(() => {
    if (!seasonalAnalysis?.monthlyChartData?.length) return 0
    return seasonalAnalysis.monthlyChartData.reduce((sum: number, item: any) => sum + item.revenue, 0) / seasonalAnalysis.monthlyChartData.length
  }, [seasonalAnalysis?.monthlyChartData])

  // Calculate dynamic Y-axis ticks for customer category chart
  const customerCategoryYAxisTicks = useMemo(() => {
    const data = selectedCategory ? customersInCategory?.customerData : customerPerformanceData?.treeMapData
    if (!data?.length) return [0, 100000, 200000, 300000, 400000]
    
    const maxValue = Math.max(...data.map((item: any) => item.value))
    const tickCount = 5
    const tickInterval = Math.ceil(maxValue / (tickCount - 1) / 10000) * 10000 // Round to nearest 10K
    
    return Array.from({ length: tickCount }, (_, i) => i * tickInterval)
  }, [customerPerformanceData?.treeMapData, customersInCategory?.customerData, selectedCategory])

  // Calculate dynamic Y-axis ticks for top projects chart
  const topProjectsYAxisTicks = useMemo(() => {
    if (!topProjectsData?.topProjects?.length) return [0, 25000, 50000, 75000, 100000]
    
    const maxValue = Math.max(...topProjectsData.topProjects.slice(0, 5).map((item: any) => item.revenue))
    const tickCount = 5
    const tickInterval = Math.ceil(maxValue / (tickCount - 1) / 5000) * 5000 // Round to nearest 5K
    
    return Array.from({ length: tickCount }, (_, i) => i * tickInterval)
  }, [topProjectsData?.topProjects])

  // Custom tooltip for monthly revenue line chart
  const CustomMonthlyTooltip = ({ active, payload, label }: any) => {
    if (active && payload && payload.length) {
      const data = payload[0].payload
      return (
        <div className="bg-white p-3 border rounded shadow-lg">
          <p className="font-semibold">{selectedMonth ? `${selectedMonth} ${data.year}` : data.fullMonth}</p>
          <p className="text-blue-600">Revenue: {formatCurrency(data.revenue)}</p>
          {!selectedMonth && (
            <p className="text-gray-600">vs Baseline: {formatCurrency(data.revenue - monthlyRevenueBaseline)}</p>
          )}
          <p className="text-gray-600">Hours: {formatNumber(data.hours)}</p>
          <p className="text-gray-600">Projects: {data.projectCount}</p>
          {!selectedMonth && data.isLowSeason && (
            <Badge variant="destructive" className="mt-1">Low Season</Badge>
          )}
          {!selectedMonth && (
            <p className="text-xs text-gray-500 mt-2">Click to see yearly breakdown</p>
          )}
        </div>
      )
    }
    return null
  }

  // Custom tooltip for YoY growth chart
  const CustomYoyTooltip = ({ active, payload, label }: any) => {
    if (active && payload && payload.length) {
      const data = payload[0].payload
      return (
        <div className="bg-white p-3 border rounded shadow-lg">
          <p className="font-semibold">{data.fullMonth}</p>
          <p className={`${data.growthRate >= 0 ? 'text-green-600' : 'text-red-600'}`}>
            YoY Growth: {data.growthRate > 0 ? '+' : ''}{data.growthRate.toFixed(1)}%
          </p>
          <p className="text-gray-600">Based on {data.yearCount} year comparisons</p>
        </div>
      )
    }
    return null
  }

  // Custom tooltip for customer category chart
  const CustomCategoryTooltip = ({ active, payload, label }: any) => {
    if (active && payload && payload.length) {
      const data = payload[0].payload
      return (
        <div className="bg-white p-3 border rounded shadow-lg">
          <p className="font-semibold">{selectedCategory ? `Customer: ${data.name}` : `Category: ${data.name}`}</p>
          <p className="text-blue-600">Revenue: {formatCurrency(data.value)}</p>
          {data.hours && <p className="text-gray-600">Hours: {formatNumber(data.hours)}</p>}
          {data.months && <p className="text-gray-600">Active Months: {data.months}</p>}
          {!selectedCategory && (
            <p className="text-xs text-gray-500 mt-2">Click to see top customers in this category</p>
          )}
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
        activeTab="seasonal-analysis"
        customers={customers}
        projects={projects}
        resources={resources}
      >
        <div className="flex items-center justify-center h-64">
          <div className="text-lg">Loading seasonal analysis...</div>
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
        activeTab="seasonal-analysis"
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
      activeTab="seasonal-analysis"
      customers={customers}
      projects={projects}
      resources={resources}
    >

      {/* Key Performance Indicators - Exactly as specified in requirements */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Rolling 12-Month Average</CardTitle>
            <DollarSign className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {formatCurrency(seasonalKPIs.averageMonthlyRevenue)}
            </div>
            <p className="text-xs text-muted-foreground">
              Average monthly revenue (last 12 months)
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">YoY Monthly Growth Rate</CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {seasonalKPIs.yoyMonthlyGrowthRate > 0 ? '+' : ''}{seasonalKPIs.yoyMonthlyGrowthRate.toFixed(1)}%
            </div>
            <p className="text-xs text-muted-foreground">
              Average monthly growth rate
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Low Season Customer Revenue</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {formatCurrency(seasonalKPIs.lowSeasonCustomerRevenue)}
            </div>
            <p className="text-xs text-muted-foreground">
              Bottom 3 months combined
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Top 5 Low Season Projects</CardTitle>
            <Target className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {formatCurrency(seasonalKPIs.topLowSeasonProjectsRevenue)}
            </div>
            <p className="text-xs text-muted-foreground">
              Revenue from top 5 projects
            </p>
          </CardContent>
        </Card>
          </div>

      {/* Main Visualizations - Adhering to visual hierarchy */}
      <div className={`grid grid-cols-1 lg:grid-cols-3 gap-6 mb-6 transition-opacity duration-300 ${refreshing ? 'opacity-75' : 'opacity-100'}`}>
        {/* Line Chart: Average Monthly Revenue (2020-2024) or Yearly Data for Selected Month */}
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Calendar className="w-5 h-5" />
              {selectedMonth ? `${selectedMonth} Revenue Across All Years` : 'Average Monthly Revenue (2020-2024)'}
              {selectedMonth && (
                <button 
                  onClick={() => {
                    setSelectedMonth(null)
                    setYearlyDataForMonth(null)
                  }}
                  className="ml-2 px-2 py-1 text-xs bg-gray-200 hover:bg-gray-300 rounded"
                >
                  ← Back to Monthly View
                </button>
              )}
            </CardTitle>
            <CardDescription>
              {selectedMonth 
                ? `Showing ${selectedMonth} revenue data for each year (2020-2024)` 
                : 'Monthly revenue patterns with baseline reference (click on any month to see that month across all years)'
              }
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="relative">
              {monthDataLoading && (
                <div className="absolute inset-0 bg-white/50 flex items-center justify-center z-10 rounded">
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <div className="animate-spin h-4 w-4 border-2 border-blue-500 border-t-transparent rounded-full"></div>
                    Loading {selectedMonth} data...
                  </div>
                </div>
              )}
              {selectedMonth && (!yearlyDataForMonth?.yearlyData || yearlyDataForMonth.yearlyData.length === 0) ? (
                <div className="flex items-center justify-center h-[300px] text-muted-foreground">
                  <div className="text-center">
                    <p className="text-lg">No yearly data available for {selectedMonth}</p>
                    <p className="text-sm mt-2">The API endpoint may not be implemented or there's no data for this month.</p>
                    <Button 
                      variant="outline" 
                      size="sm" 
                      className="mt-4"
                      onClick={() => {
                        setSelectedMonth(null)
                        setYearlyDataForMonth(null)
                      }}
                    >
                      ← Back to Monthly View
                    </Button>
                  </div>
                </div>
              ) : (
              <ResponsiveContainer width="100%" height={300}>
                <LineChart data={selectedMonth ? yearlyDataForMonth?.yearlyData || [] : seasonalAnalysis?.monthlyChartData || []}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis 
                      dataKey={selectedMonth ? "year" : "month"}
                      angle={-45}
                      textAnchor="end"
                      height={80}
                      fontSize={12}
                    />
                    <YAxis tickFormatter={(value) => formatCurrency(value)} />
                    <Tooltip content={<CustomMonthlyTooltip />} />
                    <Legend />
                  
                  {/* Baseline reference line - only show for monthly view */}
                  {!selectedMonth && (
                    <ReferenceLine 
                      y={monthlyRevenueBaseline} 
                      stroke={BASELINE_COLOR}
                      strokeDasharray="5 5" 
                      label="Baseline"
                    />
                  )}
                  
                  {/* Revenue line with conditional coloring and click handling */}
                  <Line 
                    type="monotone" 
                    dataKey="revenue" 
                    stroke={PRIMARY_COLOR}
                    strokeWidth={3}
                    name={selectedMonth ? `${selectedMonth} Revenue` : "Monthly Revenue"}
                    dot={(props: any) => {
                      const { payload } = props
                      return (
                        <circle
                          cx={props.cx}
                          cy={props.cy}
                          r={8}
                          fill={selectedMonth ? PRIMARY_COLOR : (payload.isLowSeason ? NEGATIVE_COLOR : PRIMARY_COLOR)}
                          stroke={selectedMonth ? PRIMARY_COLOR : (payload.isLowSeason ? NEGATIVE_COLOR : PRIMARY_COLOR)}
                          strokeWidth={2}
                          style={{ cursor: selectedMonth ? 'default' : 'pointer' }}
                          onClick={() => !selectedMonth && handleMonthClick(payload)}
                        />
                      )
                    }}
                  />
                </LineChart>
                </ResponsiveContainer>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Bar Chart: Year-over-Year Monthly Revenue Growth */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <TrendingUp className="w-5 h-5" />
              Year-over-Year Monthly Revenue Growth
            </CardTitle>
            <CardDescription>
              Monthly growth rates compared to previous year
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={yoyGrowthData?.yoyGrowthData || []}>
                  <CartesianGrid strokeDasharray="3 3" />
                <XAxis 
                  dataKey="month" 
                  angle={-45}
                  textAnchor="end"
                  height={80}
                  fontSize={12}
                />
                <YAxis tickFormatter={(value) => `${value}%`} />
                <Tooltip content={<CustomYoyTooltip />} />
                  <Legend />
                
                {/* Zero reference line */}
                <ReferenceLine y={0} stroke={BASELINE_COLOR} strokeDasharray="5 5" />
                
                <Bar dataKey="growthRate" name="YoY Growth Rate">
                  {(yoyGrowthData?.yoyGrowthData || []).map((entry: any, index: number) => (
                    <Cell key={`yoy-cell-${index}`} fill={entry.growthRate >= 0 ? POSITIVE_COLOR : NEGATIVE_COLOR} />
                  ))}
                </Bar>
              </BarChart>
              </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      {/* Low Season Deep Dive */}
      <div className="mt-10 mb-6">
        <h2 className="text-2xl font-bold tracking-tight">Low Season Deep Dive</h2>
        <p className="text-muted-foreground">
          Analysis of customer and project performance during the lowest revenue months.
        </p>
      </div>

      {/* Horizontal Bar Charts - Grouped for clarity */}
      <div className={`grid grid-cols-1 lg:grid-cols-2 gap-6 transition-opacity duration-300 ${refreshing ? 'opacity-75' : 'opacity-100'}`}>
        {/* Horizontal Bar Chart: Revenue by Customer Category (Low Season) */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Users className="w-5 h-5" />
              {selectedCategory 
                ? `Top 5 Customers in ${selectedCategory} (Low Season)`
                : 'Revenue by Customer Category (Low Season)'
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
                ? `Top performing customers in ${selectedCategory} during the 3 lowest revenue months`
                : 'Customer category performance during the 3 lowest months (click on any category to drill down)'
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
                    <p className="text-sm mt-2">This category may not have any customers during low season months.</p>
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
              ) : (
                <ResponsiveContainer width="100%" height={300}>
                  <BarChart 
                    data={selectedCategory ? (customersInCategory?.customerData || []) : (customerPerformanceData?.treeMapData || [])} 
                    margin={{ top: 5, right: 5, left: 0, bottom: 50 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis 
                      dataKey="name" 
                      angle={-45}
                      textAnchor="end"
                      height={80}
                      fontSize={11}
                    />
                    <YAxis 
                      tickFormatter={(value) => formatCurrency(value)}
                      width={80}
                      fontSize={11}
                      domain={[0, 'dataMax']}
                      tick={{ fontSize: 11 }}
                      ticks={customerCategoryYAxisTicks}
                    />
                    <Tooltip content={<CustomCategoryTooltip />} />
                    <Bar 
                      dataKey="value" 
                      fill={PRIMARY_COLOR}  
                      onClick={!selectedCategory ? handleCategoryClick : undefined}
                      style={!selectedCategory ? { cursor: 'pointer' } : {}}
                    />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Horizontal Bar Chart: Top 5 Projects by Revenue (Low Season) */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <DollarSign className="w-5 h-5" />
                            Top 5 Projects by Revenue (Low Season)
            </CardTitle>
            <CardDescription>
              Highest performing projects during the 3 lowest revenue months
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <BarChart 
                data={topProjectsData?.topProjects?.slice(0, 5) || []} 
                margin={{ top: 5, right: 5, left: 0, bottom: 50 }}
              >
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis 
                  dataKey="project"
                  angle={-45}
                  textAnchor="end"
                  height={80}
                  fontSize={11}
                  tickFormatter={(value) => value.length > 15 ? `${value.substring(0, 15)}...` : value}
                />
                <YAxis 
                  tickFormatter={(value) => formatCurrency(value)}
                  width={80}
                  fontSize={11}
                  domain={[0, 'dataMax']}
                  tick={{ fontSize: 11 }}
                  ticks={topProjectsYAxisTicks}
                />
                <Tooltip 
                  formatter={(value: any) => [formatCurrency(value), "Revenue"]}
                  labelFormatter={(label) => `Project: ${label}`}
                />
                <Bar dataKey="revenue" fill={PRIMARY_COLOR} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>


    </DashboardLayout>
  )
} 