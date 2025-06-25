"use client"

import { useState, useEffect, useMemo } from "react"
import { TrendingUp, Calendar, BarChart3, Users, Zap, DollarSign } from "lucide-react"
import DashboardLayout from "../components/layout/DashboardLayout"
import { useDashboard } from "../context/DashboardContext"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
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
} from "recharts"

// Colors for charts
const COLORS = ["#0088FE", "#00C49F", "#FFBB28", "#FF8042", "#8884d8", "#82ca9d"]
const FORECAST_COLOR = "#10b981"
const ACTUAL_COLOR = "#3b82f6"
const FITTED_COLOR = "#f59e0b"

// Professional colors for business charts
const PROFESSIONAL_BLUE = "#374151"
const PROFESSIONAL_SLATE = "#64748b"

export default function DashboardOverviewPage() {
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
  const [seasonalData, setSeasonalData] = useState<any>(null)
  const [growthData, setGrowthData] = useState<any>(null)
  const [projectData, setProjectData] = useState<any>(null)
  const [resourceData, setResourceData] = useState<any>(null)
  const [forecastingData, setForecastingData] = useState<any>(null)

  const fetchOverviewData = async (isInitial = false) => {
    try {
      if (isInitial) setInitialLoading(true)
      else setRefreshing(true)
      setError(null)

      const params = new URLSearchParams()
      if (selectedCustomers.length > 0 && !selectedCustomers.includes('all')) params.append('customers', selectedCustomers.join(','))
      if (selectedProjects.length > 0 && !selectedProjects.includes('all')) params.append('projects', selectedProjects.join(','))
      if (selectedResources.length > 0 && !selectedResources.includes('all')) params.append('resources', selectedResources.join(','))
      if (selectedDateRange.start) params.append('startDate', selectedDateRange.start)
      if (selectedDateRange.end) params.append('endDate', selectedDateRange.end)

      const queryString = params.toString()
      const baseUrl = (endpoint: string) => `http://localhost:5000${endpoint}${queryString ? `?${queryString}` : ''}`

      console.log('Fetching overview data with params:', queryString)

      const [
        seasonalResponse,
        growthResponse,
        projectResponse,
        resourceResponse,
        forecastResponse,
      ] = await Promise.all([
        fetch(baseUrl('/api/seasonal-analysis')),
        fetch(baseUrl('/api/growth-drivers')),
        fetch(baseUrl('/api/project-analytics/revenue-by-project')),
        fetch(baseUrl('/api/resource-performance/top-resources')),
        fetch(baseUrl('/api/forecasting')),
      ])

      if (!seasonalResponse.ok) throw new Error(`Failed to fetch seasonal data: ${seasonalResponse.status}`)
      if (!growthResponse.ok) throw new Error(`Failed to fetch growth data: ${growthResponse.status}`)
      if (!projectResponse.ok) throw new Error(`Failed to fetch project data: ${projectResponse.status}`)
      if (!resourceResponse.ok) throw new Error(`Failed to fetch resource data: ${resourceResponse.status}`)
      if (!forecastResponse.ok) throw new Error(`Failed to fetch forecasting data: ${forecastResponse.status}`)

      const [seasonal, growth, project, resource, forecast] = await Promise.all([
        seasonalResponse.json(),
        growthResponse.json(),
        projectResponse.json(),
        resourceResponse.json(),
        forecastResponse.json(),
      ])

      console.log('Fetched overview data:', { seasonal, growth, project, resource, forecast })

      setSeasonalData(seasonal)
      setGrowthData(growth)
      setProjectData(project)
      setResourceData(resource)
      setForecastingData(forecast)

    } catch (err) {
      console.error('Error fetching overview data:', err)
      setError(err instanceof Error ? err.message : 'An error occurred')
    } finally {
      setInitialLoading(false)
      setRefreshing(false)
    }
  }

  useEffect(() => {
    if (!contextLoading) {
      const isInitialLoad = !seasonalData && !growthData && !projectData && !resourceData && !forecastingData
      fetchOverviewData(isInitialLoad)
    }
  }, [contextLoading, selectedCustomers, selectedProjects, selectedResources, selectedDateRange])

  const combinedForecastChartData = useMemo(() => {
    if (!forecastingData?.historicalData || !forecastingData?.forecastData) return []
    return [...forecastingData.historicalData, ...forecastingData.forecastData]
  }, [forecastingData])

  // Calculate KPIs for the dashboard overview
  const dashboardKPIs = useMemo(() => {
    const currentYear = new Date().getFullYear()
    
    // 1. Average Hourly Rate (Revenue Efficiency)
    const totalRevenue = seasonalData?.monthlyChartData?.reduce((sum: number, month: any) => sum + month.revenue, 0) || 0
    const totalHours = seasonalData?.monthlyChartData?.reduce((sum: number, month: any) => sum + (month.hours || 0), 0) || 0
    const averageHourlyRate = totalHours > 0 ? totalRevenue / totalHours : 0
    
    // 2. YoY Growth Rate (Latest available)
    const latestYoyGrowth = growthData?.annualGrowthData?.length > 0 ? 
      growthData.annualGrowthData[growthData.annualGrowthData.length - 1]?.yoyGrowthRate || 0 : 0
    
    // 3. Rolling 12-Month Average (same logic as seasonal analysis)
    let rolling12MonthAverage = 0
    if (seasonalData?.monthlyChartData?.length > 0) {
      const sortedMonthlyData = [...seasonalData.monthlyChartData].sort((a, b) => {
        const dateA = new Date(a.fullMonth || `${a.month} 2024`)
        const dateB = new Date(b.fullMonth || `${b.month} 2024`)
        return dateB.getTime() - dateA.getTime() // Most recent first
      })
      const last12Months = sortedMonthlyData.slice(0, 12)
      rolling12MonthAverage = last12Months.length > 0 ? 
        last12Months.reduce((sum: number, month: any) => sum + month.revenue, 0) / last12Months.length : 0
    }
    
    // 4. Top Project Revenue
    const topProjectRevenue = projectData?.barChartData?.length > 0 ? 
      Math.max(...projectData.barChartData.map((project: any) => project.value)) : 0
    
    // 5. Top Resource Revenue
    const topResourceRevenue = resourceData?.topResources?.length > 0 ? 
      Math.max(...resourceData.topResources.map((resource: any) => resource.totalRevenue)) : 0
    
    // 6. Total Billable Hours (Current Year estimate based on monthly data)
    const totalBillableHours = seasonalData?.monthlyChartData?.length > 0 ?
      seasonalData.monthlyChartData.reduce((sum: number, month: any) => sum + (month.hours || 0), 0) : 0

    return {
      averageHourlyRate,
      latestYoyGrowth,
      rolling12MonthAverage,
      topProjectRevenue,
      topResourceRevenue,
      totalBillableHours
    }
  }, [seasonalData, growthData, projectData, resourceData])

  // Tooltips
  const CustomMonthlyTooltip = ({ active, payload, label }: any) => {
    if (active && payload && payload.length) {
      const data = payload[0].payload
      return (
        <div className="bg-white p-3 border rounded shadow-lg">
          <p className="font-semibold">{data.fullMonth}</p>
          <p style={{ color: COLORS[0] }}>Revenue: {formatCurrency(data.revenue)}</p>
          <p style={{ color: COLORS[1] }}>Hours: {formatNumber(data.hours)}</p>
        </div>
      )
    }
    return null
  }

  const CustomGrowthTooltip = ({ active, payload, label }: any) => {
    if (active && payload && payload.length) {
      const data = payload[0].payload
      return (
        <div className="bg-white p-3 border rounded shadow-lg">
          <p className="font-semibold">{label}</p>
          <p className="text-blue-600">Revenue: {formatCurrency(data.revenue)}</p>
          <p className="text-green-600">YoY Growth: {data.yoyGrowthRate > 0 ? '+' : ''}{data.yoyGrowthRate.toFixed(1)}%</p>
        </div>
      )
    }
    return null
  }

  const CustomBarTooltip = ({ active, payload, label }: any) => {
    if (active && payload && payload.length) {
      return (
        <div className="bg-white p-3 border rounded shadow-lg">
          <p className="font-semibold">{label}</p>
          <p className="text-blue-600">Revenue: {formatCurrency(payload[0].value)}</p>
        </div>
      )
    }
    return null
  }
  
  const CustomResourceTooltip = ({ active, payload, label }: any) => {
    if (active && payload && payload.length) {
      const data = payload[0].payload
      return (
        <div className="bg-white p-3 border rounded shadow-lg">
          <p className="font-semibold">{data.fullName}</p>
          <p className="text-blue-600">Revenue: {formatCurrency(data.totalRevenue)}</p>
          <p className="text-gray-600">Hours: {formatNumber(data.totalHours)}</p>
          <p className="text-purple-600">Blended Rate: {formatCurrency(data.blendedRate)}</p>
        </div>
      )
    }
    return null
  }

  const CustomForecastTooltip = ({ active, payload, label }: any) => {
    if (active && payload && payload.length) {
      const data = payload[0].payload
      return (
        <div className="bg-white p-4 border rounded-lg shadow-lg max-w-xs">
          <p className="font-semibold text-gray-900 mb-2">{data.monthLabel}</p>
          
          {data.actual !== undefined && (
            <div className="flex justify-between items-center mb-1">
              <span className="text-sm text-gray-600">Historical Revenue:</span>
              <span className="font-medium" style={{ color: ACTUAL_COLOR }}>
                {formatCurrency(data.actual)}
              </span>
            </div>
          )}
          
          {data.fitted !== undefined && (
            <div className="flex justify-between items-center mb-1">
              <span className="text-sm text-gray-600">Model Trend:</span>
              <span className="font-medium" style={{ color: FITTED_COLOR }}>
                {formatCurrency(data.fitted)}
              </span>
            </div>
          )}
          
          {data.forecast !== undefined && (
            <div className="flex justify-between items-center mb-2">
              <span className="text-sm text-gray-600">Revenue Forecast:</span>
              <span className="font-medium" style={{ color: FORECAST_COLOR }}>
                {formatCurrency(data.forecast)}
              </span>
            </div>
          )}
          
          {data.lowerBound !== undefined && data.upperBound !== undefined && (
            <div className="pt-2 border-t border-gray-200">
              <div className="text-xs text-gray-500 mb-1">Confidence Interval (95%):</div>
              <div className="flex justify-between text-xs">
                <span>Low: <span className="font-medium">{formatCurrency(data.lowerBound)}</span></span>
                <span>High: <span className="font-medium">{formatCurrency(data.upperBound)}</span></span>
              </div>
              <div className="text-xs text-gray-400 mt-1 text-center">
                Range: ±{formatCurrency(Math.abs(data.upperBound - data.forecast))}
              </div>
            </div>
          )}
          
          <div className="mt-2 pt-2 border-t border-gray-100">
            <span className="text-xs font-medium px-2 py-1 rounded" style={{
              backgroundColor: data.dataType === 'historical' ? '#eff6ff' : '#f0fdf4',
              color: data.dataType === 'historical' ? '#1e40af' : '#166534'
            }}>
              {data.dataType === 'historical' ? 'Historical Data' : 'Projected Data'}
            </span>
          </div>
        </div>
      )
    }
    return null
  }

  if (contextLoading || initialLoading) {
    return (
      <DashboardLayout
        selectedCustomers={selectedCustomers}
        setSelectedCustomers={setSelectedCustomers}
        selectedProjects={selectedProjects}
        setSelectedProjects={setSelectedProjects}
        selectedResources={selectedResources}
        setSelectedResources={setSelectedResources}
        activeTab="overview"
        customers={customers}
        projects={projects}
        resources={resources}
      >
        <div className="flex items-center justify-center h-64">
          <div className="text-lg">Loading dashboard overview...</div>
        </div>
      </DashboardLayout>
    )
  }

  if (error) {
    return (
      <DashboardLayout
        selectedCustomers={selectedCustomers}
        setSelectedCustomers={setSelectedCustomers}
        selectedProjects={selectedProjects}
        setSelectedProjects={setSelectedProjects}
        selectedResources={selectedResources}
        setSelectedResources={setSelectedResources}
        activeTab="overview"
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
      activeTab="overview"
      customers={customers}
      projects={projects}
      resources={resources}
    >
      {/* Key Performance Indicators */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Average Hourly Rate</CardTitle>
            <DollarSign className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {formatCurrency(dashboardKPIs.averageHourlyRate)}
            </div>
            <p className="text-xs text-muted-foreground">
              Revenue efficiency across all work
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
              {dashboardKPIs.latestYoyGrowth > 0 ? '+' : ''}{dashboardKPIs.latestYoyGrowth.toFixed(1)}%
            </div>
            <p className="text-xs text-muted-foreground">
              Year-over-year growth
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Rolling 12-Month Avg</CardTitle>
            <Calendar className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {formatCurrency(dashboardKPIs.rolling12MonthAverage)}
            </div>
            <p className="text-xs text-muted-foreground">
              Monthly average (last 12 months)
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Billable Hours</CardTitle>
            <Zap className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {formatNumber(dashboardKPIs.totalBillableHours)}
            </div>
            <p className="text-xs text-muted-foreground">
              All tracked billable hours
            </p>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 gap-6">
        {/* Forecasting Chart */}
        <Card className="col-span-1">
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><TrendingUp className="w-5 h-5" />Revenue Forecast</CardTitle>
            <CardDescription>Holt-Winters forecast showing historical, fitted, and projected revenue.</CardDescription>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={400}>
              <ComposedChart data={combinedForecastChartData} margin={{ top: 20, right: 30, left: 20, bottom: 15 }}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis 
                  dataKey="monthLabel" 
                  fontSize={12} 
                  angle={-45}
                  textAnchor="end"
                  height={60}
                />
                <YAxis tickFormatter={(value) => formatCurrency(value)} />
                <Tooltip content={<CustomForecastTooltip />} />
                <Legend />
                
                {/* Confidence interval area - rendered without legend entries */}
                <Area type="monotone" dataKey="upperBound" fill={FORECAST_COLOR} fillOpacity={0.15} stroke="none" legendType="none" />
                <Area type="monotone" dataKey="lowerBound" fill="white" fillOpacity={1} stroke="none" legendType="none" />
                
                {/* Revenue lines */}
                <Line type="monotone" dataKey="actual" stroke={ACTUAL_COLOR} strokeWidth={2} name="Historical Revenue" dot={false} />
                <Line type="monotone" dataKey="fitted" stroke={FITTED_COLOR} strokeWidth={2} strokeDasharray="5 5" name="Model Trend" dot={false} />
                <Line type="monotone" dataKey="forecast" stroke={FORECAST_COLOR} strokeWidth={3} name="Revenue Forecast" dot={false} />
                
                {/* Custom legend entry for confidence interval */}
                <Line type="monotone" dataKey="upperBound" stroke={FORECAST_COLOR} strokeWidth={0} fill={FORECAST_COLOR} fillOpacity={0.15} name="Confidence Interval" connectNulls={false} dot={false} legendType="rect" />
              </ComposedChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Seasonal Analysis Chart */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2"><Calendar className="w-5 h-5" />Monthly Revenue Analysis</CardTitle>
              <CardDescription>Average monthly revenue and billable hours.</CardDescription>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={300}>
                <ComposedChart data={seasonalData?.monthlyChartData || []}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="month" fontSize={12} />
                  <YAxis yAxisId="left" tickFormatter={(value) => formatCurrency(value)} />
                  <YAxis yAxisId="right" orientation="right" tickFormatter={(value) => formatNumber(value)} />
                  <Tooltip content={<CustomMonthlyTooltip />} />
                  <Legend />
                  <Bar yAxisId="left" dataKey="revenue" name="Revenue" fill={COLORS[0]} />
                  <Line yAxisId="right" type="monotone" dataKey="hours" name="Hours" stroke={COLORS[1]} />
                </ComposedChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          {/* Growth Drivers Chart */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2"><DollarSign className="w-5 h-5" />Annual Revenue & YoY Growth</CardTitle>
              <CardDescription>Yearly revenue totals with year-over-year growth rate.</CardDescription>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={300}>
                <ComposedChart data={growthData?.annualGrowthData || []}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="year" fontSize={12} />
                  <YAxis yAxisId="left" tickFormatter={(value) => formatCurrency(value)} />
                  <YAxis yAxisId="right" orientation="right" tickFormatter={(value) => `${value}%`} />
                  <Tooltip content={<CustomGrowthTooltip />} />
                  <Legend />
                  <Bar yAxisId="left" dataKey="revenue" name="Annual Revenue" fill="#3b82f6" />
                  <Line yAxisId="right" type="monotone" dataKey="yoyGrowthRate" stroke="#10b981" strokeWidth={3} name="YoY Growth Rate (%)" />
                </ComposedChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          {/* Project Analytics Chart */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2"><BarChart3 className="w-5 h-5" />Top 5 Projects by Revenue</CardTitle>
              <CardDescription>Highest revenue-generating projects in the selected period.</CardDescription>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={projectData?.barChartData || []} layout="vertical" margin={{ left: -50}}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis type="number" tickFormatter={(value) => formatCurrency(value)} />
                  <YAxis type="category" dataKey="name" width={150} fontSize={12} />
                  <Tooltip content={<CustomBarTooltip />} />
                  <Bar dataKey="value" name="Revenue" fill={ACTUAL_COLOR} />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          {/* Resource Performance Chart */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2"><Users className="w-5 h-5" />Top 10 Performing Resources</CardTitle>
              <CardDescription>Resources contributing the most revenue.</CardDescription>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={resourceData?.topResources || []} layout="vertical" margin={{ left: -100}}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis type="number" tickFormatter={(value) => formatCurrency(value)} />
                  <YAxis type="category" dataKey="resourceName" width={150} fontSize={12} />
                  <Tooltip content={<CustomResourceTooltip />} />
                  <Bar dataKey="totalRevenue" name="Revenue" fill={FORECAST_COLOR} />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        </div>
      </div>
    </DashboardLayout>
  )
}
