"use client";

import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Loader2, RefreshCw, AlertCircle, CheckCircle2 } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";

export default function ChatbotAdminPage() {
  const [isIndexing, setIsIndexing] = useState(false);
  const [isCheckingStatus, setIsCheckingStatus] = useState(false);
  const [fullRefresh, setFullRefresh] = useState(false);
  const [maxAgeDays, setMaxAgeDays] = useState(7);
  const [indexResult, setIndexResult] = useState<{
    status: "success" | "error" | null;
    message: string;
    count?: number;
  }>({
    status: null,
    message: "",
  });
  const [systemStatus, setSystemStatus] = useState({
    online: false,
    reportsIndexed: "Unknown",
    lastChecked: null as Date | null
  });

  // Function to trigger report indexing
  const handleIndexReports = async () => {
    setIsIndexing(true);
    setIndexResult({ status: null, message: "" });

    try {
      const response = await fetch("/api/chat/index-reports", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          full_refresh: fullRefresh,
          max_age_days: maxAgeDays
        }),
      });

      const data = await response.json();

      if (response.ok && data.success) {
        setIndexResult({
          status: "success",
          message: data.message || "Successfully populated knowledge base from web sources",
          count: data.count,
        });
      } else {
        setIndexResult({
          status: "error",
          message: data.message || data.error || "Failed to populate knowledge base",
        });
      }
    } catch (error) {
      console.error("Error populating knowledge base:", error);
      setIndexResult({
        status: "error",
        message: "An error occurred while populating the knowledge base",
      });
    } finally {
      setIsIndexing(false);
    }
  };

  // Function to check system status
  const checkSystemStatus = async () => {
    setIsCheckingStatus(true);
    
    try {
      const response = await fetch("/api/chat/index-reports", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
      });

      const data = await response.json();
      
      if (response.ok) {
        setSystemStatus({
          online: true,
          reportsIndexed: data.count || "Unknown",
          lastChecked: new Date()
        });
        
        // Also update the index result if successful
        if (data.success) {
          setIndexResult({
            status: "success",
            message: data.message || `Retrieved status: ${data.count} reports indexed`,
            count: data.count,
          });
        }
      } else {
        setSystemStatus({
          online: false,
          reportsIndexed: "Unknown",
          lastChecked: new Date()
        });
      }
    } catch (error) {
      console.error("Error checking system status:", error);
      setSystemStatus({
        online: false,
        reportsIndexed: "Unknown",
        lastChecked: new Date()
      });
    } finally {
      setIsCheckingStatus(false);
    }
  };
  
  // Check status on component mount
  useEffect(() => {
    checkSystemStatus();
  }, []);

  return (
    <div className="container mx-auto py-4">
      <h1 className="text-2xl font-bold mb-6">Chatbot Administration</h1>

      <div className="grid gap-6 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Knowledge Base Population</CardTitle>
            <CardDescription>
              Populate the knowledge base by crawling web sources
            </CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground mb-4">
              This will crawl and process all web pages listed in the BusinessReports/pages.txt file and add them to the
              vector database for retrieval. This process may take several minutes depending on the
              number of web sources and their content size.
            </p>

            <div className="space-y-4 mb-4">
              <div className="flex items-center space-x-2">
                <input
                  type="checkbox"
                  id="fullRefresh"
                  checked={fullRefresh}
                  onChange={(e) => setFullRefresh(e.target.checked)}
                  className="rounded border-gray-300"
                />
                <label htmlFor="fullRefresh" className="text-sm font-medium">
                  Full Refresh (re-crawl all URLs)
                </label>
              </div>
              
              <div className="flex items-center space-x-2">
                <label htmlFor="maxAge" className="text-sm font-medium">
                  Max Age (days):
                </label>
                <input
                  type="number"
                  id="maxAge"
                  min="1"
                  max="30"
                  value={maxAgeDays}
                  onChange={(e) => setMaxAgeDays(parseInt(e.target.value) || 7)}
                  className="w-20 px-2 py-1 text-sm border rounded"
                />
                <span className="text-xs text-muted-foreground">
                  Re-crawl URLs older than this many days
                </span>
              </div>
            </div>

            {indexResult.status && (
              <Alert
                variant={indexResult.status === "success" ? "default" : "destructive"}
                className="mb-4"
              >
                {indexResult.status === "success" ? (
                  <CheckCircle2 className="h-4 w-4" />
                ) : (
                  <AlertCircle className="h-4 w-4" />
                )}
                <AlertTitle>
                  {indexResult.status === "success" ? "Success" : "Error"}
                </AlertTitle>
                <AlertDescription>{indexResult.message}</AlertDescription>
                {indexResult.count !== undefined && (
                  <p className="mt-2 text-sm font-medium">
                    {indexResult.count} reports indexed
                  </p>
                )}
              </Alert>
            )}
          </CardContent>
          <CardFooter>
            <Button
              onClick={handleIndexReports}
              disabled={isIndexing}
              className="w-full"
            >
              {isIndexing ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Populating Knowledge Base...
                </>
              ) : (
                <>
                  <RefreshCw className="mr-2 h-4 w-4" />
                  Populate Knowledge Base
                </>
              )}
            </Button>
          </CardFooter>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Chatbot Status</CardTitle>
            <CardDescription>
              View and manage the chatbot system status
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div className="flex justify-between items-center">
                <span className="text-sm font-medium">System Status:</span>
                <span className={`text-sm font-medium ${systemStatus.online ? 'text-green-500' : 'text-red-500'}`}>
                  {systemStatus.online ? 'Online' : 'Offline'}
                </span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-sm font-medium">Model:</span>
                <span className="text-sm">OpenRouter GPT</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-sm font-medium">Embedding Model:</span>
                <span className="text-sm">all-MiniLM-L6-v2</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-sm font-medium">Web Sources Indexed:</span>
                <span className="text-sm">{systemStatus.reportsIndexed}</span>
              </div>
              {systemStatus.lastChecked && (
                <div className="flex justify-between items-center">
                  <span className="text-sm font-medium">Last Checked:</span>
                  <span className="text-sm">{systemStatus.lastChecked.toLocaleTimeString()}</span>
                </div>
              )}
            </div>
          </CardContent>
          <CardFooter>
            <Button 
              variant="outline" 
              className="w-full" 
              onClick={checkSystemStatus}
              disabled={isCheckingStatus}
            >
              {isCheckingStatus ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Checking Status...
                </>
              ) : (
                <>
                  <RefreshCw className="mr-2 h-4 w-4" />
                  Check Status
                </>
              )}
            </Button>
          </CardFooter>
        </Card>
      </div>
    </div>
  );
} 