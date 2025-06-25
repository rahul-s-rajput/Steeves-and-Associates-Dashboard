"use client"

import { useState, useEffect, useMemo } from "react"
import { TrendingUp, Calendar, Target, AlertTriangle, BarChart3, Activity, Brain, Zap, DollarSign, TrendingDown } from "lucide-react"
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
  ReferenceLine,
} from "recharts"

// Style Guide for Visual Elements - A more professional and limited color palette
const PRIMARY_COLOR = "#3b82f6";    // Blue for actual data
const POSITIVE_COLOR = "#14b8a6";   // Teal for forecasts
const NEUTRAL_COLOR = "#6b7280";   // Gray for baselines, non-critical info
const ACCENT_COLOR_ORANGE = "#f59e0b"; // Amber/Orange for fitted values
const ACCENT_COLOR_PURPLE = "#8b5cf6"; // Purple for residuals
const NEGATIVE_COLOR = "#dc2626";   // A less saturated red for filtered data overlay

export default function ForecastingDashboard() {
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
  const [forecastingData, setForecastingData] = useState<any>(null)
  const [autocorrelationData, setAutocorrelationData] = useState<any>(null)
  const [modelDiagnostics, setModelDiagnostics] = useState<any>(null)

  // Fetch forecasting data from Flask APIs
  const fetchForecastingData = async (isInitial = false) => {
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

      console.log('Fetching forecasting data with params:', queryString)

      // Fetch all forecasting data in parallel
      const [
        forecastResponse,
        acfResponse,
        diagnosticsResponse
      ] = await Promise.all([
        fetch(baseUrl('/api/forecasting')),
        fetch('http://localhost:5000/api/forecasting/autocorrelation'), // ACF/PACF always unfiltered
        fetch('http://localhost:5000/api/forecasting/model-diagnostics')  // Diagnostics always unfiltered
      ])

      if (!forecastResponse.ok) throw new Error(`Failed to fetch forecasting data: ${forecastResponse.status}`)
      if (!acfResponse.ok) throw new Error(`Failed to fetch autocorrelation data: ${acfResponse.status}`)
      if (!diagnosticsResponse.ok) throw new Error(`Failed to fetch model diagnostics: ${diagnosticsResponse.status}`)

      const [forecast, acf, diagnostics] = await Promise.all([
        forecastResponse.json(),
        acfResponse.json(),
        diagnosticsResponse.json()
      ])

      console.log('Fetched forecasting data:', { forecast, acf, diagnostics })

      setForecastingData(forecast)
      setAutocorrelationData(acf)
      setModelDiagnostics(diagnostics)

    } catch (err) {
      console.error('Error fetching forecasting data:', err)
      setError(err instanceof Error ? err.message : 'An error occurred')
    } finally {
      setInitialLoading(false)
      setRefreshing(false)
    }
  }

  // Fetch data when component mounts or filters change
  useEffect(() => {
    if (!contextLoading) {
      const isInitialLoad = forecastingData === null
      fetchForecastingData(isInitialLoad)
    }
  }, [contextLoading, selectedCustomers, selectedProjects, selectedResources, selectedDateRange])

  // Calculate KPIs as specified in requirements
  const forecastingKPIs = useMemo(() => {
    if (!forecastingData?.kpis) {
      return {
        forecastedRevenue12Months: 0,
        forecastVsActualAccuracy: 0,
        modelAccuracyMAPE: 0,
        modelAccuracyRMSE: 0
      }
    }

    const kpis = forecastingData.kpis

    // 1. Forecasted Monthly Revenue (Next 12 Months) - from Holt-Winters
    const forecastedRevenue12Months = kpis.forecastedRevenue12Months || 0

    // 2. Forecasted vs. Actual Revenue accuracy (Last 12 Months)
    const actual = kpis.last12MonthsActual || 0
    const fitted = kpis.last12MonthsFitted || 0
    const forecastVsActualAccuracy = actual > 0 ? (1 - Math.abs(actual - fitted) / actual) * 100 : 0

    // 3. Model Accuracy (MAPE) - from Holt-Winters fitted values
    const modelAccuracyMAPE = kpis.modelAccuracyMAPE || 0

    // 4. Model Accuracy (RMSE) - from Holt-Winters fitted values  
    const modelAccuracyRMSE = kpis.modelAccuracyRMSE || 0

    return {
      forecastedRevenue12Months,
      forecastVsActualAccuracy,
      modelAccuracyMAPE,
      modelAccuracyRMSE
    }
  }, [forecastingData])

  // Combine historical and forecast data for main chart
  const combinedChartData = useMemo(() => {
    if (!forecastingData?.historicalData || !forecastingData?.forecastData) return []

    const historical = forecastingData.historicalData.map((item: any) => ({
      ...item,
      dataType: 'historical'
    }))

    const forecast = forecastingData.forecastData.map((item: any) => ({
      ...item,
      dataType: 'forecast'
    }))

    return [...historical, ...forecast]
  }, [forecastingData])

  // Filter applied actual data for overlay
  const filteredActualData = useMemo(() => {
    return forecastingData?.filteredActualData || []
  }, [forecastingData])

  // Custom tooltip for main forecast chart
  const CustomForecastTooltip = ({ active, payload, label }: any) => {
    if (active && payload && payload.length) {
      const data = payload[0].payload
      return (
        <div className="bg-white p-4 border rounded-lg shadow-lg max-w-xs">
          <p className="font-semibold text-gray-900 mb-2">{data.monthLabel}</p>
          
          {data.actual !== undefined && (
            <div className="flex justify-between items-center mb-1">
              <span className="text-sm text-gray-600">Historical Revenue:</span>
              <span className="font-medium" style={{ color: PRIMARY_COLOR }}>
                {formatCurrency(data.actual)}
              </span>
            </div>
          )}
          
          {data.fitted !== undefined && (
            <div className="flex justify-between items-center mb-1">
              <span className="text-sm text-gray-600">Model Trend:</span>
              <span className="font-medium" style={{ color: ACCENT_COLOR_ORANGE }}>
                {formatCurrency(data.fitted)}
              </span>
            </div>
          )}
          
          {data.forecast !== undefined && (
            <div className="flex justify-between items-center mb-2">
              <span className="text-sm text-gray-600">Revenue Forecast:</span>
              <span className="font-medium" style={{ color: POSITIVE_COLOR }}>
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

  // Calculate business insights
  const businessInsights = useMemo(() => {
    if (!forecastingData?.forecastData || !forecastingData?.historicalData) return null

    const forecastData = forecastingData.forecastData
    const historicalData = forecastingData.historicalData

    // Get last actual month and first forecast month
    const lastActual = historicalData[historicalData.length - 1]?.actual || 0
    const firstForecast = forecastData[0]?.forecast || 0
    
    // Calculate month-over-month growth
    const momGrowth = lastActual > 0 ? ((firstForecast - lastActual) / lastActual) * 100 : 0

    // Calculate average forecast vs recent performance
    const last6MonthsActual = historicalData.slice(-6).reduce((sum: number, item: any) => sum + (item.actual || 0), 0) / 6
    const next6MonthsForecast = forecastData.slice(0, 6).reduce((sum: number, item: any) => sum + (item.forecast || 0), 0) / 6
    const avgGrowthRate = last6MonthsActual > 0 ? ((next6MonthsForecast - last6MonthsActual) / last6MonthsActual) * 100 : 0

    return {
      momGrowth,
      avgGrowthRate,
      lastActual,
      firstForecast
    }
  }, [forecastingData])

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
        activeTab="forecasting"
        customers={customers}
        projects={projects}
        resources={resources}
      >
        <div className="flex items-center justify-center h-64">
          <div className="text-lg">Loading forecasting analysis...</div>
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
        activeTab="forecasting"
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
      activeTab="forecasting"
      customers={customers}
      projects={projects}
      resources={resources}
    >


      {/* Filter Behavior Notice */}
      <div className="mb-6 p-4 bg-blue-50 border border-blue-200 rounded-lg">
        <div className="flex items-center gap-2 text-blue-800">
          <AlertTriangle className="w-4 h-4" />
          <strong>Filter Behavior:</strong>
        </div>
        <p className="text-blue-700 text-sm mt-1">
          The forecast line represents overall company projections. 
          Filters show how specific segments compare against these company-wide trends.
        </p>
      </div>

      {/* Key Performance Indicators */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Forecasted Revenue (Next 12M)</CardTitle>
            <DollarSign className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold" style={{ color: POSITIVE_COLOR }}>
              {formatCurrency(forecastingKPIs.forecastedRevenue12Months)}
            </div>
            <p className="text-xs text-muted-foreground">
              Total projected revenue
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Forecast Accuracy</CardTitle>
            <Target className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold" style={{ color: PRIMARY_COLOR }}>
              {forecastingKPIs.forecastVsActualAccuracy.toFixed(1)}%
            </div>
            <p className="text-xs text-muted-foreground">
              Historical model performance
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Expected Growth Rate</CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold" style={{ 
              color: (businessInsights?.avgGrowthRate ?? 0) >= 0 ? POSITIVE_COLOR : NEGATIVE_COLOR 
            }}>
              {(businessInsights?.avgGrowthRate ?? 0) >= 0 ? '+' : ''}{(businessInsights?.avgGrowthRate ?? 0).toFixed(1)}%
            </div>
            <p className="text-xs text-muted-foreground">
              6-month average forecast vs recent
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Model Confidence</CardTitle>
            <Brain className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold" style={{ color: ACCENT_COLOR_ORANGE }}>
              {(100 - forecastingKPIs.modelAccuracyMAPE).toFixed(1)}%
            </div>
            <p className="text-xs text-muted-foreground">
              Statistical model reliability
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Main Forecasting Chart */}
      <div className={`mb-6 transition-opacity duration-300 ${refreshing ? 'opacity-75' : 'opacity-100'}`}>
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <TrendingUp className="w-5 h-5" />
              Revenue Forecast vs. Historical Performance
            </CardTitle>
            <CardDescription>
              Historical revenue trends with forward-looking projections and confidence intervals.
              {selectedCustomers.length > 0 && !selectedCustomers.includes('all') && ' Filtered segment data shown in red overlay.'}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={450}>
              <ComposedChart data={combinedChartData} margin={{ top: 20, right: 30, left: 20, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis 
                  dataKey="monthLabel"
                  angle={-45}
                  textAnchor="end"
                  height={80}
                  fontSize={12}
                />
                <YAxis tickFormatter={(value) => formatCurrency(value)} />
                <Tooltip content={<CustomForecastTooltip />} />
                <Legend />

                {/* Confidence interval area - rendered without legend entries */}
                <Area
                  type="monotone"
                  dataKey="upperBound"
                  fill={POSITIVE_COLOR}
                  fillOpacity={0.15}
                  stroke="none"
                  legendType="none"
                />
                <Area
                  type="monotone"
                  dataKey="lowerBound"
                  fill="white"
                  fillOpacity={1}
                  stroke="none"
                  legendType="none"
                />

                {/* Historical revenue line */}
                <Line
                  type="monotone"
                  dataKey="actual"
                  stroke={PRIMARY_COLOR}
                  strokeWidth={2}
                  name="Historical Revenue"
                  connectNulls={false}
                  dot={{ fill: PRIMARY_COLOR, strokeWidth: 1, r: 3 }}
                />

                {/* Model trend line */}
                <Line
                  type="monotone"
                  dataKey="fitted"
                  stroke={ACCENT_COLOR_ORANGE}
                  strokeWidth={2}
                  strokeDasharray="5 5"
                  name="Model Trend"
                  connectNulls={false}
                  dot={{ fill: ACCENT_COLOR_ORANGE, strokeWidth: 1, r: 3 }}
                />

                {/* Forecast line */}
                <Line
                  type="monotone"
                  dataKey="forecast"
                  stroke={POSITIVE_COLOR}
                  strokeWidth={3}
                  name="Revenue Forecast"
                  connectNulls={false}
                  dot={{ fill: POSITIVE_COLOR, strokeWidth: 2, r: 4 }}
                />

                {/* Custom legend entry for confidence interval */}
                <Line
                  type="monotone"
                  dataKey="upperBound"
                  stroke={POSITIVE_COLOR}
                  strokeWidth={0}
                  fill={POSITIVE_COLOR}
                  fillOpacity={0.15}
                  name="Confidence Interval"
                  connectNulls={false}
                  dot={false}
                  legendType="rect"
                />
              </ComposedChart>
            </ResponsiveContainer>

            {/* Filtered Actual Data Overlay */}
            {filteredActualData.length > 0 && (
              <div className="mt-4">
                <h4 className="text-sm font-medium mb-2 text-red-600">Filtered Segment Performance</h4>
                <ResponsiveContainer width="100%" height={200}>
                  <LineChart data={filteredActualData} margin={{ top: 10, right: 30, left: 20, bottom: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis 
                      dataKey="monthLabel"
                      angle={-45}
                      textAnchor="end"
                      height={60}
                      fontSize={11}
                    />
                    <YAxis tickFormatter={(value) => formatCurrency(value)} fontSize={11} />
                    <Tooltip 
                      formatter={(value: any) => [formatCurrency(value), "Segment Revenue"]}
                      labelFormatter={(label) => `${label}`}
                    />
                    <Line
                      type="monotone"
                      dataKey="actual"
                      stroke={NEGATIVE_COLOR}
                      strokeWidth={2}
                      name="Segment Revenue"
                      dot={{ fill: NEGATIVE_COLOR, strokeWidth: 1, r: 3 }}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Business Insights & Scenarios */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
        {/* Business Performance Analysis */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <BarChart3 className="w-5 h-5" />
              Business Performance Analysis
            </CardTitle>
            <CardDescription>
              Key business metrics and growth indicators
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div className="flex justify-between items-center p-3 bg-gray-50 rounded">
                  <div>
                  <div className="text-sm font-medium">Month-over-Month Growth</div>
                  <div className="text-xs text-muted-foreground">Next month vs current</div>
                </div>
                <div className="text-lg font-bold" style={{ 
                  color: (businessInsights?.momGrowth ?? 0) >= 0 ? POSITIVE_COLOR : NEGATIVE_COLOR 
                }}>
                  {(businessInsights?.momGrowth ?? 0) >= 0 ? '+' : ''}{(businessInsights?.momGrowth ?? 0).toFixed(1)}%
                    </div>
                  </div>

              <div className="flex justify-between items-center p-3 bg-gray-50 rounded">
                  <div>
                  <div className="text-sm font-medium">Trend Strength</div>
                  <div className="text-xs text-muted-foreground">Overall business momentum</div>
                    </div>
                <div className="text-lg font-bold" style={{ color: POSITIVE_COLOR }}>
                  {modelDiagnostics?.timeSeriesProperties?.trendStrength ? 
                    `${(modelDiagnostics.timeSeriesProperties.trendStrength * 100).toFixed(0)}%` : 'N/A'}
                    </div>
                  </div>

              <div className="flex justify-between items-center p-3 bg-gray-50 rounded">
                  <div>
                  <div className="text-sm font-medium">Seasonality Impact</div>
                  <div className="text-xs text-muted-foreground">Recurring business patterns</div>
                    </div>
                <div className="text-lg font-bold" style={{ color: ACCENT_COLOR_PURPLE }}>
                  {modelDiagnostics?.timeSeriesProperties?.seasonalityStrength ? 
                    `${(modelDiagnostics.timeSeriesProperties.seasonalityStrength * 100).toFixed(0)}%` : 'N/A'}
                </div>
                  </div>

              <div className="flex justify-between items-center p-3 bg-gray-50 rounded">
                <div>
                  <div className="text-sm font-medium">Forecast Reliability</div>
                  <div className="text-xs text-muted-foreground">Model prediction accuracy</div>
                </div>
                <div className="text-lg font-bold" style={{ color: ACCENT_COLOR_ORANGE }}>
                  {(100 - forecastingKPIs.modelAccuracyMAPE).toFixed(0)}%
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Planning Scenarios */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Target className="w-5 h-5" />
              Strategic Planning Insights
            </CardTitle>
            <CardDescription>
              Business planning recommendations based on forecast data
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {(businessInsights?.avgGrowthRate ?? 0) > 0 ? (
                <div className="p-3 bg-green-50 border border-green-200 rounded">
                  <div className="flex items-center gap-2 text-green-800 mb-1">
                    <TrendingUp className="w-4 h-4" />
                    <span className="font-medium">Growth Opportunity</span>
                  </div>
                  <p className="text-sm text-green-700">
                    Forecasts indicate positive growth. Consider capacity planning and resource scaling.
                  </p>
                </div>
              ) : (
                <div className="p-3 bg-amber-50 border border-amber-200 rounded">
                  <div className="flex items-center gap-2 text-amber-800 mb-1">
                    <TrendingDown className="w-4 h-4" />
                    <span className="font-medium">Caution Advised</span>
                  </div>
                  <p className="text-sm text-amber-700">
                    Forecasts show potential decline. Review market conditions and adjust strategies.
                  </p>
                </div>
              )}

              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <div className="font-medium mb-1">Current Performance</div>
                  <div>{formatCurrency(businessInsights?.lastActual || 0)}</div>
                  <div className="text-xs text-muted-foreground">Last actual month</div>
                </div>
                <div>
                  <div className="font-medium mb-1">Next Month Target</div>
                  <div>{formatCurrency(businessInsights?.firstForecast || 0)}</div>
                  <div className="text-xs text-muted-foreground">Forecasted revenue</div>
                </div>
              </div>

              <div className="pt-3 border-t">
                <div className="text-sm font-medium mb-2">Planning Recommendations:</div>
                <ul className="text-xs text-muted-foreground space-y-1">
                  <li>• Monitor forecast accuracy monthly</li>
                  <li>• Adjust resource allocation based on trends</li>
                  <li>• Plan for seasonal variations</li>
                  <li>• Review customer segments regularly</li>
                </ul>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Executive Summary */}
      <Card>
        <CardHeader>
          <CardTitle>Executive Summary & Key Insights</CardTitle>
          <CardDescription>Strategic overview of revenue forecasting analysis</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div>
              <h4 className="font-semibold mb-3 flex items-center gap-2">
                <DollarSign className="w-4 h-4" style={{ color: POSITIVE_COLOR }} />
                Revenue Outlook
              </h4>
              <div className="space-y-2 text-sm">
                <div>Next 12M Revenue: <span className="font-medium">{formatCurrency(forecastingKPIs.forecastedRevenue12Months)}</span></div>
                <div>Growth Rate: <span className="font-medium" style={{ 
                  color: (businessInsights?.avgGrowthRate ?? 0) >= 0 ? POSITIVE_COLOR : NEGATIVE_COLOR 
                }}>
                  {(businessInsights?.avgGrowthRate ?? 0) >= 0 ? '+' : ''}{(businessInsights?.avgGrowthRate ?? 0).toFixed(1)}%
                </span></div>
                <div>Confidence Level: <span className="font-medium">{(100 - forecastingKPIs.modelAccuracyMAPE).toFixed(0)}%</span></div>
              </div>
            </div>
            <div>
              <h4 className="font-semibold mb-3 flex items-center gap-2">
                <TrendingUp className="w-4 h-4" style={{ color: ACCENT_COLOR_ORANGE }} />
                Business Trends
              </h4>
              <div className="space-y-2 text-sm">
                <div>Trend Strength: <span className="font-medium">
                  {modelDiagnostics?.timeSeriesProperties?.trendStrength ? 
                    `${(modelDiagnostics.timeSeriesProperties.trendStrength * 100).toFixed(0)}%` : 'N/A'}
                </span></div>
                <div>Seasonal Patterns: <span className="font-medium">
                  {modelDiagnostics?.timeSeriesProperties?.seasonalityStrength ? 
                    `${(modelDiagnostics.timeSeriesProperties.seasonalityStrength * 100).toFixed(0)}%` : 'N/A'}
                </span></div>
                <div>Data Quality: <span className="font-medium">
                  {modelDiagnostics?.timeSeriesProperties?.dataPoints || 0} months
                </span></div>
              </div>
            </div>
            <div>
              <h4 className="font-semibold mb-3 flex items-center gap-2">
                <Target className="w-4 h-4" style={{ color: PRIMARY_COLOR }} />
                Strategic Actions
              </h4>
              <div className="space-y-2 text-sm">
                <div>Forecast Accuracy: <span className="font-medium">{forecastingKPIs.forecastVsActualAccuracy.toFixed(0)}%</span></div>
                <div>Planning Horizon: <span className="font-medium">12 months</span></div>
                <div>Review Frequency: <span className="font-medium">Monthly</span></div>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </DashboardLayout>
  )
} 