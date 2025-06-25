"use client"

import { ReactNode, useState } from "react"
import Sidebar from "./Sidebar"

interface ChatbotLayoutProps {
  children: ReactNode
}

export default function ChatbotLayout({ children }: ChatbotLayoutProps) {
  const [sidebarTab, setSidebarTab] = useState("dashboard")

  return (
    <div className="flex h-screen w-full bg-background overflow-hidden">
      {/* Left Sidebar - sticky */}
      <div className="sticky top-0 h-screen">
        <Sidebar activeTab="chatbot" sidebarTab={sidebarTab} setSidebarTab={setSidebarTab} />
      </div>

      {/* Main Content - scrollable */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Main content (children) */}
        {children}
      </div>
    </div>
  )
} 