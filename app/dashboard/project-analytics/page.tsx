"use client"

import { useState, useEffect, useMemo } from "react"
import { Target, Briefcase, Users, TrendingUp, CheckCircle, Calendar, BarChart3, Activity, PieChart } from "lucide-react"
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
  ZAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ReferenceLine,
  ResponsiveContainer,
  PieChart as RechartsPieChart,
  Pie,
  Cell,
  ScatterChart,
  Scatter,
  ComposedChart,
  Area,
  AreaChart,
} from "recharts"

// Style Guide for Visual Elements - A more professional and limited color palette
const PRIMARY_COLOR = "#3b82f6"; // Blue for primary metrics and revenue data
const POSITIVE_COLOR = "#14b8a6"; // A professional teal for positive values
const NEGATIVE_COLOR = "#dc2626"; // A less saturated red for negative values
const NEUTRAL_COLOR = "#6b7280";  // A neutral gray for routine or baseline data

// Consistent, professional color palette for multi-category charts
const CATEGORY_COLORS = ["#3b82f6", "#14b8a6", "#f97316", "#8b5cf6", NEUTRAL_COLOR, "#ec4899"];

// Colors for the strategic portfolio quadrants, aligned with the style guide
const QUADRANT_COLORS: { [key: string]: string } = {
  'High-Value Specialists': POSITIVE_COLOR,
  'Strategic Partnerships': PRIMARY_COLOR,
  'Routine Tasks': NEUTRAL_COLOR,
  'Efficiency Drains': NEGATIVE_COLOR,
};

export default function ProjectAnalyticsDashboard() {
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
  const [projectAnalysisData, setProjectAnalysisData] = useState<any>(null)
  const [topProjectsBarData, setTopProjectsBarData] = useState<any>(null)
  const [durationData, setDurationData] = useState<any>(null)
  const [projectsByCategoryData, setProjectsByCategoryData] = useState<any>(null)
  const [projectValueData, setProjectValueData] = useState<any>(null)
  const [efficiencyQuadrantData, setEfficiencyQuadrantData] = useState<any>(null)
  const [portfolioMixData, setPortfolioMixData] = useState<any>(null)
  
  // Interactive states
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null)
  const [categoryProjectsData, setCategoryProjectsData] = useState<any>(null)
  const [categoryDataLoading, setCategoryDataLoading] = useState(false)
  const [selectedDurationBucket, setSelectedDurationBucket] = useState<string | null>(null)
  const [bucketValueAnalysisData, setBucketValueAnalysisData] = useState<any>(null)
  const [bucketDataLoading, setBucketDataLoading] = useState(false)
  const [xAxisDomain, setXAxisDomain] = useState<[number | string, number | string] | null>(null)


  // Fetch main project analytics data
  const fetchProjectAnalyticsData = async (isInitial = false) => {
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

      console.log('Fetching project analytics data with params:', queryString)

      // Fetch all project analytics data in parallel
      const [
        analyticsResponse,
        topProjectsBarResponse,
        durationResponse,
        projectsByCategoryResponse,
        projectValueResponse,
        efficiencyQuadrantResponse,
        portfolioMixResponse,
      ] = await Promise.all([
        fetch(baseUrl('/api/project-analytics')),
        fetch(baseUrl('/api/project-analytics/revenue-by-project')),
        fetch(baseUrl('/api/project-analytics/duration-distribution')),
        fetch(baseUrl('/api/project-analytics/top-projects')),
        fetch(baseUrl('/api/project-analytics/project-value-analysis')),
        fetch(baseUrl('/api/project-analytics/project-efficiency-quadrant')),
        fetch(baseUrl('/api/project-analytics/portfolio-mix')),
      ])

      if (!analyticsResponse.ok) throw new Error(`Failed to fetch project analytics: ${analyticsResponse.status}`)
      if (!topProjectsBarResponse.ok) throw new Error(`Failed to fetch top projects bar data: ${topProjectsBarResponse.status}`)
      if (!durationResponse.ok) throw new Error(`Failed to fetch duration data: ${durationResponse.status}`)
      if (!projectsByCategoryResponse.ok) throw new Error(`Failed to fetch projects by category: ${projectsByCategoryResponse.status}`)
      if (!projectValueResponse.ok) throw new Error(`Failed to fetch project value data: ${projectValueResponse.status}`)
      if (!efficiencyQuadrantResponse.ok) throw new Error(`Failed to fetch efficiency quadrant data: ${efficiencyQuadrantResponse.status}`)
      if (!portfolioMixResponse.ok) throw new Error(`Failed to fetch portfolio mix data: ${portfolioMixResponse.status}`)

      const [analytics, topProjectsBar, duration, projectsByCategory, projectValue, efficiencyQuadrant, portfolioMix] = await Promise.all([
        analyticsResponse.json(),
        topProjectsBarResponse.json(),
        durationResponse.json(),
        projectsByCategoryResponse.json(),
        projectValueResponse.json(),
        efficiencyQuadrantResponse.json(),
        portfolioMixResponse.json(),
      ])

      console.log('Fetched project analytics data:', { analytics, topProjectsBar, duration, projectsByCategory, projectValue, efficiencyQuadrant, portfolioMix })

      setProjectAnalysisData(analytics)
      setTopProjectsBarData(topProjectsBar)
      setDurationData(duration)
      setProjectsByCategoryData(projectsByCategory)
      setProjectValueData(projectValue)
      setEfficiencyQuadrantData(efficiencyQuadrant)
      setPortfolioMixData(portfolioMix)

    } catch (err) {
      console.error('Error fetching project analytics data:', err)
      setError(err instanceof Error ? err.message : 'An error occurred')
    } finally {
      setInitialLoading(false)
      setRefreshing(false)
    }
  }



  // Fetch top projects for a specific category (drill-down)
  const fetchTopProjectsForCategory = async (category: string) => {
    try {
      setCategoryDataLoading(true)
      const params = new URLSearchParams()
      // Pass existing filters
      if (selectedCustomers.length > 0 && !selectedCustomers.includes('all')) params.append('customers', selectedCustomers.join(','))
      if (selectedProjects.length > 0 && !selectedProjects.includes('all')) params.append('projects', selectedProjects.join(','))
      if (selectedResources.length > 0 && !selectedResources.includes('all')) params.append('resources', selectedResources.join(','))
      if (selectedDateRange.start) params.append('startDate', selectedDateRange.start)
      if (selectedDateRange.end) params.append('endDate', selectedDateRange.end)
      // Add category parameter
      params.append('category', category)

      const url = `http://localhost:5000/api/project-analytics/top-projects-for-category?${params.toString()}`
      const response = await fetch(url)
      if (!response.ok) throw new Error(`Failed to fetch top projects for category ${category}`)
      const data = await response.json()
      
      setCategoryProjectsData(data)
      setSelectedCategory(category)

    } catch (err) {
      console.error('Error fetching top projects for category:', err)
      setError(err instanceof Error ? err.message : 'An error occurred')
    } finally {
      setCategoryDataLoading(false)
    }
  }

  // Fetch value analysis for a specific duration bucket (drill-down)
  const fetchValueAnalysisForBucket = async (bucketName: string) => {
    try {
      setBucketDataLoading(true)
      const params = new URLSearchParams()
      // Pass existing filters
      if (selectedCustomers.length > 0 && !selectedCustomers.includes('all')) params.append('customers', selectedCustomers.join(','))
      if (selectedProjects.length > 0 && !selectedProjects.includes('all')) params.append('projects', selectedProjects.join(','))
      if (selectedResources.length > 0 && !selectedResources.includes('all')) params.append('resources', selectedResources.join(','))
      if (selectedDateRange.start) params.append('startDate', selectedDateRange.start)
      if (selectedDateRange.end) params.append('endDate', selectedDateRange.end)
      // Add bucket parameter
      params.append('bucket', bucketName)

      const url = `http://localhost:5000/api/project-analytics/project-value-analysis?${params.toString()}`
      const response = await fetch(url)
      if (!response.ok) throw new Error(`Failed to fetch value analysis for bucket ${bucketName}`)
      const data = await response.json()
      
      setBucketValueAnalysisData(data)
      setSelectedDurationBucket(bucketName)
      setXAxisDomain(getDomainFromBucket(bucketName))

    } catch (err) {
      console.error('Error fetching value analysis for bucket:', err)
      setError(err instanceof Error ? err.message : 'An error occurred')
    } finally {
      setBucketDataLoading(false)
    }
  }

  // Gets the X-axis domain based on a duration bucket name
  const getDomainFromBucket = (bucketName: string | null): [number | string, number | string] => {
    if (!bucketName) return [0, 'auto'];
    const mapping: { [key: string]: [number | string, number | string] } = {
      '0-30 days': [0, 30],
      '31-60 days': [30, 60],
      '61-90 days': [60, 90],
      '91-120 days': [90, 120],
      '121-180 days': [120, 180],
      '181-365 days': [180, 365],
      '365+ days': [365, 'auto'],
    };
    return mapping[bucketName] || [0, 'auto'];
  };



  // Handle category bar chart click for drill-down
  const handleCategoryBarClick = (data: any) => {
    if (data && data.category) {
      if (selectedCategory === data.category) {
        setSelectedCategory(null)
        setCategoryProjectsData(null)
      } else {
        fetchTopProjectsForCategory(data.category)
      }
    }
  }

  // Handle histogram bar click for drill-down
  const handleHistogramClick = (data: any) => {
    if (data && data.bucket) {
      if (selectedDurationBucket === data.bucket) {
        setSelectedDurationBucket(null)
        setBucketValueAnalysisData(null)
        setXAxisDomain(null)
      } else {
        fetchValueAnalysisForBucket(data.bucket)
        setXAxisDomain(getDomainFromBucket(data.bucket))
      }
    }
  }

  // Fetch data when component mounts or filters change
  useEffect(() => {
    if (!contextLoading) {
      const isInitialLoad = projectAnalysisData === null
      fetchProjectAnalyticsData(isInitialLoad)
    }
  }, [contextLoading, selectedCustomers, selectedProjects, selectedResources, selectedDateRange])

  // Calculate KPIs from the project analytics data
  const projectKPIs = useMemo(() => {
    if (!projectAnalysisData?.kpis) {
      return {
        totalProjects: 0,
        totalRevenue: 0,
        avgDuration: 0,
        top10Revenue: 0,
        avgRevenuePerProject: 0
      }
    }

    const kpis = projectAnalysisData.kpis
    const avgRevenuePerProject = kpis.totalProjects > 0 ? kpis.totalRevenue / kpis.totalProjects : 0
    const top10Revenue = kpis.top10Projects.reduce((sum: number, project: any) => sum + project.revenue, 0)

    return {
      totalProjects: kpis.totalProjects,
      totalRevenue: kpis.totalRevenue,
      avgDuration: kpis.avgDuration,
      top10Revenue,
      avgRevenuePerProject
    }
  }, [projectAnalysisData])

  // Custom tooltip components

  const CustomBarTooltip = ({ active, payload, label }: any) => {
    if (active && payload && payload.length) {
      const data = payload[0].payload
      return (
        <div className="bg-white p-3 border rounded shadow-lg">
          <p className="font-semibold">{data.fullProject || label}</p>
          <p className="text-blue-600">Revenue: {formatCurrency(data.revenue || data.value)}</p>
          {data.hours && <p className="text-gray-600">Hours: {formatNumber(data.hours)}</p>}
          {data.resources && <p className="text-gray-600">Resources: {data.resources}</p>}
          {data.customer && <p className="text-gray-600">Customer: {data.customer}</p>}
        </div>
      )
    }
    return null
  }

  const CustomHistogramTooltip = ({ active, payload, label }: any) => {
    if (active && payload && payload.length) {
      const data = payload[0].payload
      return (
        <div className="bg-white p-3 border rounded shadow-lg">
          <p className="font-semibold">Duration: {label}</p>
          <p className="text-blue-600">Projects: {data.count}</p>
          <p className="text-gray-600">Avg Duration: {data.avgDuration.toFixed(1)} days</p>
          <p className="text-xs text-gray-500 mt-2">Click to see top 5 projects in this duration range</p>
        </div>
      )
    }
    return null
  }

  const CustomValueAnalysisTooltip = ({ active, payload }: any) => {
    if (active && payload && payload.length) {
      const data = payload[0].payload
      return (
        <div className="bg-white p-3 border rounded shadow-lg">
          <p className="font-semibold">{data.project}</p>
          <p className="text-gray-600">Category: {data.category}</p>
          <p>Revenue: {formatCurrency(data.revenue)}</p>
          <p>Duration: {data.duration} days</p>
          <p>Avg. Rate: {formatCurrency(data.rate)}/hr</p>
        </div>
      )
    }
    return null
  }

  // Reusable Project Value Scatter Plot component
  const ProjectValueScatterPlot = ({ data, loading, xAxisDomain }: { data: any[], loading: boolean, xAxisDomain?: [number | string, number | string] | null }) => (
    <div className="h-[300px] relative">
       {loading && (
        <div className="absolute inset-0 bg-white/50 flex items-center justify-center z-10 rounded">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <div className="animate-spin h-4 w-4 border-2 border-blue-500 border-t-transparent rounded-full"></div>
            Loading...
          </div>
        </div>
      )}
      <ResponsiveContainer width="100%" height="100%">
        <ScatterChart margin={{ top: 20, right: 30, left: 20, bottom: 20 }}>
          <CartesianGrid />
          <XAxis 
            type="number" 
            dataKey="duration" 
            name="Project Duration" 
            unit=" days" 
            tick={{ fontSize: 10 }}
            domain={xAxisDomain || [0, 'auto']}
          />
          <YAxis 
            type="number" 
            dataKey="revenue" 
            name="Revenue" 
            tickFormatter={(value) => formatCurrency(value)}
            tick={{ fontSize: 10 }}
            width={80}
          />
          <ZAxis type="number" dataKey="rate" name="Avg. Rate" range={[40, 40]} />
          <Tooltip cursor={{ strokeDasharray: '3 3' }} content={<CustomValueAnalysisTooltip />} />
          <Legend wrapperStyle={{ fontSize: '10px', paddingTop: '20px' }} />
          {
            Object.entries(
              (data || []).reduce((acc: any, cur: any) => {
                if (!acc[cur.category]) {
                  acc[cur.category] = []
                }
                acc[cur.category].push(cur)
                return acc
              }, {})
            ).map(([category, categoryData], index) => (
              <Scatter 
                key={category}
                name={category} 
                data={categoryData as any[]} 
                fill={CATEGORY_COLORS[index % CATEGORY_COLORS.length]} 
              />
            ))
          }
        </ScatterChart>
      </ResponsiveContainer>
    </div>
  )

  const CustomPortfolioTooltip = ({ active, payload, label }: any) => {
    if (active && payload && payload.length) {
      const total = payload.reduce((sum: number, entry: any) => sum + entry.value, 0);
      return (
        <div className="bg-white p-4 border rounded shadow-lg max-w-xs">
          <p className="font-bold text-lg mb-2">{label}</p>
          <div className="space-y-1">
            {payload.map((entry: any) => (
              <div key={entry.name} className="flex items-center justify-between">
                <div className="flex items-center">
                  <div className="w-3 h-3 rounded-full mr-2" style={{ backgroundColor: QUADRANT_COLORS[entry.name] }}></div>
                  <span>{entry.name}:</span>
                </div>
                <span className="font-semibold">{formatCurrency(entry.value)} ({((entry.value / total) * 100).toFixed(1)}%)</span>
              </div>
            ))}
          </div>
          <div className="border-t mt-2 pt-2 flex justify-between font-bold">
            <span>Total Revenue:</span>
            <span>{formatCurrency(total)}</span>
          </div>
        </div>
      );
    }
    return null;
  };

  // Loading state
  if (contextLoading || initialLoading) {
    return (
      <DashboardLayout
        selectedCustomers={selectedCustomers}
        setSelectedCustomers={setSelectedCustomers}
        selectedProjects={selectedProjects}
        setSelectedProjects={setSelectedProjects}
        selectedResources={selectedResources}
        setSelectedResources={setSelectedResources}
        activeTab="project-analytics"
        customers={customers}
        projects={projects}
        resources={resources}
      >
        <div className="flex items-center justify-center h-64">
          <div className="text-lg">Loading project analytics...</div>
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
        activeTab="project-analytics"
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
      activeTab="project-analytics"
      customers={customers}
      projects={projects}
      resources={resources}
    >

      {/* Key Performance Indicators */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4 mb-6">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Projects</CardTitle>
            <Briefcase className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {projectKPIs.totalProjects}
            </div>
            <p className="text-xs text-muted-foreground">
              Active and completed projects
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Revenue</CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {formatCurrency(projectKPIs.totalRevenue)}
            </div>
            <p className="text-xs text-muted-foreground">
              Across all projects
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Avg Project Duration</CardTitle>
            <Calendar className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {Math.round(projectKPIs.avgDuration)}
            </div>
            <p className="text-xs text-muted-foreground">
              Days per project
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Top 10 Revenue</CardTitle>
            <Target className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {formatCurrency(projectKPIs.top10Revenue)}
            </div>
            <p className="text-xs text-muted-foreground">
              From highest performers
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Avg Revenue/Project</CardTitle>
            <BarChart3 className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {formatCurrency(projectKPIs.avgRevenuePerProject)}
            </div>
            <p className="text-xs text-muted-foreground">
              Average project value
            </p>
          </CardContent>
        </Card>
      </div>



      {/* Main Visualizations - Adhering to visual hierarchy */}
      <div className={`grid grid-cols-1 lg:grid-cols-3 gap-6 mb-6 transition-opacity duration-300 ${refreshing ? 'opacity-75' : 'opacity-100'}`}>
        {/* Bar Chart: Top 5 Projects by Revenue */}
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <TrendingUp className="w-5 h-5" />
              Top 5 Projects by Revenue
            </CardTitle>
            <CardDescription>
              Highest revenue projects across all categories.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="h-[300px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart 
                  data={topProjectsBarData?.barChartData || []}
                  layout="vertical"
                  margin={{ top: 5, right: 30, left: 20, bottom: 5 }}
                >
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis type="number" tickFormatter={(value) => formatCurrency(value)} />
                  <YAxis 
                    type="category" 
                    dataKey="name"
                    width={120}
                    tick={{ fontSize: 11 }}
                  />
                  <Tooltip content={<CustomBarTooltip />} />
                  <Bar dataKey="value" fill={PRIMARY_COLOR} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        {/* Histogram: Project Duration Distribution */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Calendar className="w-5 h-5" />
              {selectedDurationBucket 
                ? `Value Analysis for: ${selectedDurationBucket}`
                : 'Project Duration Distribution'
              }
              {selectedDurationBucket && (
                <button 
                  onClick={() => {
                    setSelectedDurationBucket(null)
                    setBucketValueAnalysisData(null)
                  }}
                  className="ml-2 px-2 py-1 text-xs bg-gray-200 hover:bg-gray-300 rounded"
                >
                  ← Back to Duration View
                </button>
              )}
            </CardTitle>
            <CardDescription>
              {selectedDurationBucket 
                ? `Projects within the ${selectedDurationBucket} duration range.`
                : 'Number of projects by duration buckets (click to see value analysis).'
              }
            </CardDescription>
          </CardHeader>
          <CardContent>
            {selectedDurationBucket ? (
              <ProjectValueScatterPlot data={bucketValueAnalysisData?.projectValueData || []} loading={bucketDataLoading} xAxisDomain={xAxisDomain} />
            ) : (
              <div className="h-[300px]">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart 
                    data={durationData?.histogramData || []}
                  >
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis 
                      dataKey="bucket" 
                      angle={-45}
                      textAnchor="end"
                      height={80}
                      fontSize={11}
                    />
                    <YAxis />
                    <Tooltip content={<CustomHistogramTooltip />} />
                    <Bar 
                      dataKey="count" 
                      fill={PRIMARY_COLOR} 
                      onClick={handleHistogramClick}
                      style={{ cursor: 'pointer' }}
                    />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Portfolio Breakdown Section */}
      <div className="mt-10 mb-6">
        <h2 className="text-2xl font-bold tracking-tight">Portfolio Breakdown</h2>
        <p className="text-muted-foreground">
          Analysis of project distribution and strategic mix across customer categories.
        </p>
      </div>
      
      <div className={`grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6 transition-opacity duration-300 ${refreshing ? 'opacity-75' : 'opacity-100'}`}>
        {/* Bar Chart: Projects per Customer Category */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Users className="w-5 h-5" />
              {selectedCategory
                ? `Top 5 Projects in: ${selectedCategory}`
                : 'Projects per Customer Category'
              }
              {selectedCategory && (
                <button 
                  onClick={() => {
                    setSelectedCategory(null)
                    setCategoryProjectsData(null)
                  }}
                  className="ml-2 px-2 py-1 text-xs bg-gray-200 hover:bg-gray-300 rounded"
                >
                  ← Back to Categories
                </button>
              )}
            </CardTitle>
            <CardDescription>
              {selectedCategory
                ? `Top 5 projects by revenue for this category.`
                : 'Total number of projects for each customer category. Click to see top projects.'
              }
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="h-[350px] relative">
              {categoryDataLoading && (
                <div className="absolute inset-0 bg-white/50 flex items-center justify-center z-10 rounded">
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <div className="animate-spin h-4 w-4 border-2 border-blue-500 border-t-transparent rounded-full"></div>
                    Loading projects...
                  </div>
                </div>
              )}
              {selectedCategory ? (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart 
                    data={categoryProjectsData?.projectData || []}
                    layout="vertical"
                    margin={{ top: 20, right: 30, left: 20, bottom: 5 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis type="number" tickFormatter={(value) => formatCurrency(value)} />
                    <YAxis 
                      type="category" 
                      dataKey="project" 
                      width={120}
                      fontSize={10}
                    />
                    <Tooltip content={<CustomBarTooltip />} />
                    <Bar dataKey="revenue" fill={PRIMARY_COLOR} />
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart 
                    data={projectsByCategoryData?.categoryData || []}
                    layout="vertical"
                    margin={{ top: 5, right: 30, left: 20, bottom: 5 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis type="number" />
                    <YAxis 
                      type="category" 
                      dataKey="category" 
                      width={150}
                      tick={{ fontSize: 11 }}
                    />
                    <Tooltip formatter={(value: any) => [value, 'Projects']} />
                    <Bar dataKey="count" fill={PRIMARY_COLOR} onClick={handleCategoryBarClick} style={{ cursor: 'pointer' }} />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Project Portfolio Mix */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <PieChart className="w-5 h-5" />
              Project Portfolio Mix
            </CardTitle>
            <CardDescription>
              Strategic portfolio makeup of each customer category.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="h-[350px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart 
                  data={portfolioMixData?.portfolioData || []}
                  layout="vertical" 
                  stackOffset="expand"
                  margin={{ top: 20, right: 30, left: 20, bottom: 20 }}
                >
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis type="number" tickFormatter={(tick) => `${tick * 100}%`} />
                  <YAxis 
                    type="category" 
                    dataKey="category"
                    width={150}
                    tick={{ fontSize: 10 }}
                  />
                  <Tooltip content={<CustomPortfolioTooltip />} />
                  <Legend wrapperStyle={{ fontSize: '10px' }} />
                  {Object.keys(QUADRANT_COLORS).map((quadrant) => (
                    <Bar key={quadrant} dataKey={quadrant} stackId="a" fill={QUADRANT_COLORS[quadrant]} />
                  ))}
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      </div>
      
    </DashboardLayout>
  )
} 