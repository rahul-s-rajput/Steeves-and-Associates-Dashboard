"use client"

import { useState, useEffect, useMemo } from "react"
import { Users, Award, AlertTriangle, TrendingUp, Clock, DollarSign, BarChart3, Eye, EyeOff } from "lucide-react"
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
  ScatterChart,
  Scatter,
  AreaChart,
  Area,
  ZAxis,
  Cell
} from "recharts"

// Style Guide for Visual Elements - A more professional and limited color palette
const PRIMARY_COLOR = "#3b82f6"; // Blue for primary metrics and revenue data
const POSITIVE_COLOR = "#10b981"; // Green for positive values
const NEGATIVE_COLOR = "#ef4444"; // Red for negative values

// Consistent, professional color palette for resource clusters
const CLUSTER_COLORS: { [key: string]: string } = {
  'Volume Leaders': '#3b82f6',       // Primary Blue
  'Versatile Contributors': '#14b8a6', // Teal
  'Support Resources': '#f97316'      // Orange
};

export default function ResourcePerformanceDashboard() {
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
  const [resourceData, setResourceData] = useState<any>(null)
  const [topResourcesData, setTopResourcesData] = useState<any>(null)
  const [clusteringData, setClusteringData] = useState<any>(null)
  const [clusterOverTimeData, setClusterOverTimeData] = useState<any>(null)
  const [kpisData, setKpisData] = useState<any>(null)
  
  // UI states
  const [selectedCluster, setSelectedCluster] = useState<string | null>(null)

  // Fetch data from Flask APIs
  const fetchResourceData = async (isInitial = false) => {
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

      console.log('Fetching resource performance data with params:', queryString)

      // Fetch all resource performance data in parallel
      const [
        resourceResponse,
        topResourcesResponse,
        clusteringResponse,
        clusterOverTimeResponse,
        kpisResponse
      ] = await Promise.all([
        fetch(baseUrl('/api/resource-performance')),
        fetch(baseUrl('/api/resource-performance/top-resources')),
        fetch(baseUrl('/api/resource-performance/clustering')),
        fetch(baseUrl('/api/resource-performance/cluster-revenue-over-time')),
        fetch(baseUrl('/api/resource-performance/kpis'))
      ])

      if (!resourceResponse.ok) throw new Error(`Failed to fetch resource data: ${resourceResponse.status}`)
      if (!topResourcesResponse.ok) throw new Error(`Failed to fetch top resources: ${topResourcesResponse.status}`)
      if (!clusteringResponse.ok) throw new Error(`Failed to fetch clustering data: ${clusteringResponse.status}`)
      if (!clusterOverTimeResponse.ok) throw new Error(`Failed to fetch cluster over time: ${clusterOverTimeResponse.status}`)
      if (!kpisResponse.ok) throw new Error(`Failed to fetch KPIs: ${kpisResponse.status}`)

      const [resource, topResources, clustering, clusterOverTime, kpis] = await Promise.all([
        resourceResponse.json(),
        topResourcesResponse.json(),
        clusteringResponse.json(),
        clusterOverTimeResponse.json(),
        kpisResponse.json()
      ])

      console.log('Fetched resource performance data:', { resource, topResources, clustering, clusterOverTime, kpis })

      setResourceData(resource)
      setTopResourcesData(topResources)
      setClusteringData(clustering)
      setClusterOverTimeData(clusterOverTime)
      setKpisData(kpis)

    } catch (err) {
      console.error('Error fetching resource performance data:', err)
      setError(err instanceof Error ? err.message : 'An error occurred')
    } finally {
      setInitialLoading(false)
      setRefreshing(false)
    }
  }

  // Fetch data when component mounts or filters change
  useEffect(() => {
    if (!contextLoading) {
      // Only show full loading screen on initial load
      const isInitialLoad = resourceData === null
      fetchResourceData(isInitialLoad)
    }
  }, [contextLoading, selectedCustomers, selectedProjects, selectedResources, selectedDateRange])

  // Calculate KPIs from API data
  const resourceKPIs = useMemo(() => {
    if (!kpisData?.kpis) {
      return {
        totalRevenue: 0,
        totalHours: 0,
        avgHourlyRate: 0,
        activeResources: 0
      }
    }

    return kpisData.kpis
  }, [kpisData])

  // Custom tooltip for 3D scatter plot (rendered as 2D)
  const Custom3DTooltip = ({ active, payload, label }: any) => {
    if (active && payload && payload.length) {
      const data = payload[0].payload
      return (
        <div className="bg-white p-3 border rounded shadow-lg">
          <p className="font-semibold">{data.resourceName}</p>
          <p className="text-blue-600">Cluster: {data.clusterName}</p>
          <p className="text-gray-600">Hours/Month: {data.hoursPerMonth.toFixed(1)}</p>
          <p className="text-gray-600">Customer Count: {data.customerCount}</p>
          <p className="text-gray-600">Projects: {data.projectCount}</p>
          <p className="text-gray-600">Revenue: {formatCurrency(data.totalRevenue)}</p>
        </div>
      )
    }
    return null
  }

  // Custom tooltip for cluster over time
  const CustomClusterTimeTooltip = ({ active, payload, label }: any) => {
    if (active && payload && payload.length) {
      return (
        <div className="bg-white p-3 border rounded shadow-lg">
          <p className="font-semibold">Year: {label}</p>
          {payload.map((entry: any, index: number) => {
            const clusterName = entry.dataKey.replace('_', ' ')
            return (
              <p key={index} style={{ color: entry.color }}>
                {clusterName}: {formatCurrency(entry.value)}
              </p>
            )
          })}
        </div>
      )
    }
    return null
  }

  // Handle cluster click in 3D plot
  const handleClusterClick = (data: any) => {
    const cluster = data.clusterName
    if (selectedCluster === cluster) {
      setSelectedCluster(null)
    } else {
      setSelectedCluster(cluster)
    }
  }

  // Filter 3D data by selected cluster
  const filtered3DData = useMemo(() => {
    if (!clusteringData?.clusteringData) return []
    if (!selectedCluster) return clusteringData.clusteringData
    return clusteringData.clusteringData.filter((item: any) => item.clusterName === selectedCluster)
  }, [clusteringData, selectedCluster])

  // Create resource to cluster mapping
  const resourceClusterMap = useMemo(() => {
    if (!clusteringData?.clusteringData) return {}
    
    const map: { [key: string]: string } = {}
    clusteringData.clusteringData.forEach((resource: any) => {
      map[resource.resourceName] = resource.clusterName
    })
    return map
  }, [clusteringData])

  // Add cluster colors to top resources data
  const topResourcesWithColors = useMemo(() => {
    if (!topResourcesData?.topResources) return []
    
    return topResourcesData.topResources.map((resource: any) => ({
      ...resource,
      clusterName: resourceClusterMap[resource.fullName] || 'Support Resources',
      color: CLUSTER_COLORS[resourceClusterMap[resource.fullName] || 'Support Resources'] || PRIMARY_COLOR
    }))
  }, [topResourcesData, resourceClusterMap])

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
        activeTab="resource-performance"
        customers={customers}
        projects={projects}
        resources={resources}
      >
        <div className="flex items-center justify-center h-64">
          <div className="text-lg">Loading resource performance analysis...</div>
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
        activeTab="resource-performance"
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
      activeTab="resource-performance"
      customers={customers}
      projects={projects}
      resources={resources}
    >

      {/* Key Performance Indicators - Exactly as specified in requirements */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Revenue Generated</CardTitle>
            <DollarSign className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {formatCurrency(resourceKPIs.totalRevenue)}
            </div>
            <p className="text-xs text-muted-foreground">
              Selected resources & period
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Billable Hours</CardTitle>
            <Clock className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {formatNumber(resourceKPIs.totalHours)}
            </div>
            <p className="text-xs text-muted-foreground">
              Sum of all billable hours
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Average Hourly Rate</CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {formatCurrency(resourceKPIs.avgHourlyRate)}
            </div>
            <p className="text-xs text-muted-foreground">
              Blended rate across resources
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Active Resources</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {resourceKPIs.activeResources}
            </div>
            <p className="text-xs text-muted-foreground">
              Distinct count of resources
            </p>
          </CardContent>
        </Card>
          </div>

      {/* Main Visualizations - Adhering to visual hierarchy */}
      <div className={`grid grid-cols-1 lg:grid-cols-3 gap-6 mb-6 transition-opacity duration-300 ${refreshing ? 'opacity-75' : 'opacity-100'}`}>
        {/* Horizontal Bar Chart: Top 10 Resources by Revenue */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <BarChart3 className="w-5 h-5" />
              Top 10 Resources by Revenue
            </CardTitle>
            
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={320}>
              <BarChart
                data={topResourcesWithColors}
                layout="vertical"
                margin={{ top: 5, right: 5, left: -50, bottom: 5 }}
                >
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis 
                    type="number" 
                    tickFormatter={(value) => formatCurrency(value)}
                    fontSize={11}
                  />
                  <YAxis 
                    type="category" 
                    dataKey="resourceName" 
                    fontSize={10}
                    width={95}
                  />
                  <Tooltip 
                    content={(props: any) => {
                      if (props.active && props.payload && props.payload.length) {
                        const data = props.payload[0].payload
                        return (
                          <div className="bg-white p-3 border rounded shadow-lg">
                            <p className="font-semibold">{data.fullName}</p>
                            <div className="flex items-center gap-2 mt-1">
                              <div 
                                className="w-3 h-3 rounded-full"
                                style={{ backgroundColor: data.color }}
                              />
                              <p className="text-sm text-gray-600">Cluster: {data.clusterName}</p>
                            </div>
                            <p className="text-blue-600">Revenue: {formatCurrency(data.totalRevenue)}</p>
                            <p className="text-gray-600">Hours: {formatNumber(data.totalHours)}</p>
                            <p className="text-gray-600">Projects: {data.projectCount}</p>
                            <p className="text-gray-600">Customers: {data.customerCount}</p>
                            <p className="text-gray-600">Blended Rate: {formatCurrency(data.blendedRate)}</p>
                          </div>
                        )
                      }
                      return null
                    }}
                  />
                  <Bar dataKey="totalRevenue">
                    {topResourcesWithColors.map((entry: any, index: number) => (
                      <Cell key={`cell-${index}`} fill={entry.color} />
                    ))}
                  </Bar>
              </BarChart>
              </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* Interactive Resource Cluster Analysis (3D Plot + Summary Table) */}
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Award className="w-5 h-5" />
              Resource Performance Clustering
              <div className="flex gap-2 ml-auto">
                {selectedCluster && (
                  <Button 
                    variant="outline" 
                    size="sm"
                    onClick={() => setSelectedCluster(null)}
                  >
                    Show All
                  </Button>
                )}
              </div>
            </CardTitle>
            <CardDescription>
              {selectedCluster ? `Showing: ${selectedCluster}` : 'Hours/Month vs Customer Count. Bubble size represents Total Revenue.'}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {/* 2D Bubble Chart */}
              <div className="h-[300px]">
              <ResponsiveContainer width="100%" height="100%">
                  <ScatterChart
                    margin={{ top: 5, right: 5, bottom: -20, left: 0 }}
                >
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis 
                      type="number" 
                      dataKey="hoursPerMonth" 
                      name="Hours/Month"
                      tickFormatter={(value) => `${value.toFixed(0)}h`}
                      fontSize={11}
                    />
                    <YAxis 
                      type="number" 
                      dataKey="customerCount" 
                      name="Customer Count"
                      tickFormatter={(value) => value.toString()}
                      fontSize={11}
                    />
                    <ZAxis type="number" dataKey="totalRevenue" name="Total Revenue" range={[30, 400]} />
                    <Tooltip content={<Custom3DTooltip />} />
                    <Legend />
                    {Object.entries(CLUSTER_COLORS).map(([clusterName, color]) => (
                      <Scatter
                        key={clusterName}
                        name={clusterName}
                        data={filtered3DData.filter((d: any) => d.clusterName === clusterName)}
                        fill={color}
                        shape="circle"
                        onClick={(props: any) => handleClusterClick(props)}
                        style={{ cursor: 'pointer' }}
                      />
                    ))}
                  </ScatterChart>
              </ResponsiveContainer>
              </div>


            </div>
          </CardContent>
        </Card>
      </div>



      

      {/* Cluster Performance Summary Table - Full Width */}
      {clusteringData?.clusterSummary && (
        <div className={`transition-opacity duration-300 ${refreshing ? 'opacity-75' : 'opacity-100'}`}>
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <AlertTriangle className="w-5 h-5" />
                Cluster Performance Summary
              </CardTitle>
              <CardDescription>
                Detailed breakdown of resource cluster performance metrics
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <table className="w-full border-collapse border border-gray-300 text-sm">
                  <thead>
                    <tr className="bg-gray-100">
                      <th className="border border-gray-300 px-2 py-2 text-left">Cluster</th>
                      <th className="border border-gray-300 px-2 py-2 text-center">Resources</th>
                      <th className="border border-gray-300 px-2 py-2 text-center">Avg Monthly Hours</th>
                      <th className="border border-gray-300 px-2 py-2 text-center">Avg Rate</th>
                      <th className="border border-gray-300 px-2 py-2 text-center">Avg Projects</th>
                      <th className="border border-gray-300 px-2 py-2 text-center">Total Revenue</th>
                      <th className="border border-gray-300 px-2 py-2 text-center">Revenue %</th>
                    </tr>
                  </thead>
                  <tbody>
                    {clusteringData.clusterSummary.map((cluster: any, index: number) => (
                      <tr 
                        key={index} 
                        className={`${index % 2 === 0 ? 'bg-gray-50' : 'bg-white'} hover:bg-gray-100 cursor-pointer`}
                        onClick={() => handleClusterClick({ clusterName: cluster.clusterName })}
                      >
                        <td className="border border-gray-300 px-2 py-2 font-medium">
                          <div className="flex items-center gap-2">
                            <div 
                              className="w-3 h-3 rounded-full"
                              style={{ backgroundColor: CLUSTER_COLORS[cluster.clusterName] || '#8884d8' }}
                            />
                            <span className="truncate">{cluster.clusterName}</span>
                          </div>
                        </td>
                        <td className="border border-gray-300 px-2 py-2 text-center">{cluster.resourceCount}</td>
                        <td className="border border-gray-300 px-2 py-2 text-center">{cluster.avgHoursPerMonth.toFixed(1)}</td>
                        <td className="border border-gray-300 px-2 py-2 text-center">{formatCurrency(cluster.avgBlendedRate)}</td>
                        <td className="border border-gray-300 px-2 py-2 text-center">{cluster.avgProjects.toFixed(1)}</td>
                        <td className="border border-gray-300 px-2 py-2 text-center">{formatCurrency(cluster.totalRevenue)}</td>
                        <td className="border border-gray-300 px-2 py-2 text-center">{cluster.revenuePercentage.toFixed(1)}%</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </DashboardLayout>
  )
} 