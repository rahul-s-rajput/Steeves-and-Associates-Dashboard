"use client"

import {
  BarChart3,
  Building2,
  GraduationCap,
  Home,
  LayoutDashboard,
  LineChart,
  MessageSquare,
  PieChart,
  Plus,
  Users,
  Settings,
  TrendingUp,
  Calendar,
  Target,
  Activity,
  BarChart4,
  Trash2
} from "lucide-react"
import Link from "next/link"
import { useState, useEffect } from "react"
import { usePathname, useSearchParams } from "next/navigation"
import { useRouter } from "next/navigation"

interface SidebarProps {
  activeTab: string
  sidebarTab: string
  setSidebarTab: (tab: string) => void
}

// Conversation interface for tracking chat history
interface Conversation {
  id: string;
  title: string;
  timestamp: string;
  updated_at?: string;
}

export default function Sidebar({ activeTab, sidebarTab, setSidebarTab }: SidebarProps) {
  // Use router for client-side navigation
  const router = useRouter();
  
  // Add state for recent conversations
  const [recentConversations, setRecentConversations] = useState<Conversation[]>([]);
  const [activeConversationId, setActiveConversationId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  
  // Track the current route and query parameters
  const pathname = usePathname();
  const searchParams = useSearchParams();

  // Load conversations from API on initial render
  useEffect(() => {
    const fetchConversations = async () => {
      try {
        setIsLoading(true);
        const response = await fetch('http://localhost:5000/api/conversations');
        
        if (!response.ok) {
          throw new Error('Failed to fetch conversations');
        }
        
        const data = await response.json();
        
        if (data.conversations && data.conversations.length > 0) {
          setRecentConversations(data.conversations);
          
          // Clean up any temporary conversations immediately
          const dbConversationIds = new Set(data.conversations.map((c: Conversation) => c.id as string));
          cleanupAllEmptyConversations(dbConversationIds as Set<string>);
        } else {
          // Initialize with default conversations if none exist
          const defaultConversations = [
            { id: "enrollment", title: "Enrollment trends analysis", timestamp: new Date().toISOString() },
            { id: "funding", title: "Funding comparison report", timestamp: new Date(Date.now() - 86400000).toISOString() },
            { id: "program", title: "Program performance metrics", timestamp: new Date(Date.now() - 172800000).toISOString() },
          ];
          
          // Create default conversations in the database
          for (const conv of defaultConversations) {
            await fetch('http://localhost:5000/api/conversations', {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
              },
              body: JSON.stringify(conv),
            });
          }
          
          setRecentConversations(defaultConversations);
        }
      } catch (error) {
        console.error("Error loading conversations:", error);
        // Initialize with empty array on error
        setRecentConversations([]);
      } finally {
        setIsLoading(false);
      }
    };
    
    fetchConversations();
  }, []);

  // Set sidebarTab to "chatbot" when on chatbot routes
  useEffect(() => {
    if (pathname.includes('/dashboard/chatbot')) {
      setSidebarTab("chatbot");
      
      // Get the current conversation ID from URL
      const conversationId = searchParams.get('id');
      if (conversationId) {
        setActiveConversationId(conversationId);
      }
    }
  }, [pathname, searchParams, setSidebarTab]);

  // Function to create a new conversation
  const createNewConversation = async () => {
    try {
      // Check if there's already a temporary empty conversation
      // First, find conversations that don't exist in the database
      const response = await fetch('http://localhost:5000/api/conversations');
      if (!response.ok) {
        throw new Error('Failed to fetch conversations');
      }
      
      const data = await response.json();
      const dbConversations = data.conversations || [];
      const dbConversationIds = new Set(dbConversations.map((c: Conversation) => c.id as string));
      
      // Find temporary conversations that don't exist in the database
      const tempConversations = recentConversations.filter(
        conv => !dbConversationIds.has(conv.id)
      );
      
      // If we already have a temporary conversation, use it instead of creating a new one
      if (tempConversations.length > 0) {
        const existingTempConv = tempConversations[0];
        setActiveConversationId(existingTempConv.id);
        router.push(`/dashboard/chatbot?id=${existingTempConv.id}`);
        return;
      }
      
      // Otherwise, create a new temporary conversation
      const newId = `chat-${Date.now()}`;
      
      // Create a temporary conversation object for the UI only
      // It won't be stored in the database until the user sends a message
      const newConversation: Conversation = {
        id: newId,
        title: `New conversation`,
        timestamp: new Date().toISOString(),
      };
      
      // Add to the UI conversation list
      const updatedConversations = [newConversation, ...recentConversations];
      setRecentConversations(updatedConversations);
      
      // Set as active conversation
      setActiveConversationId(newId);
      
      // Navigate to the new conversation using Next.js router (no page refresh)
      router.push(`/dashboard/chatbot?id=${newId}`);
    } catch (error) {
      console.error("Error creating new conversation:", error);
    }
  };

  // Function to update a conversation title
  const updateConversationTitle = async (id: string, title: string) => {
    try {
      // Update the conversation in the database
      const response = await fetch(`http://localhost:5000/api/conversations/${id}/title`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ title }),
      });
      
      if (!response.ok) {
        throw new Error('Failed to update conversation title');
      }
      
      // Update the local state
      const updatedConversations = recentConversations.map(conv =>
        conv.id === id ? { ...conv, title } : conv
      );
      
      setRecentConversations(updatedConversations);
    } catch (error) {
      console.error("Error updating conversation title:", error);
    }
  };

  // Function to clean up empty temporary conversations
  const cleanupEmptyConversations = (dbConversationIds: Set<string>) => {
    const filteredConversations = recentConversations.filter(conv => 
      dbConversationIds.has(conv.id)
    );
    
    if (filteredConversations.length !== recentConversations.length) {
      setRecentConversations(filteredConversations);
    }
  };

  // Function to remove all temporary empty conversations (regardless of active status)
  const cleanupAllEmptyConversations = (dbConversationIds: Set<string>) => {
    // Remove conversations that aren't in the database
    const filteredConversations = recentConversations.filter(conv => 
      dbConversationIds.has(conv.id)
    );
    
    if (filteredConversations.length !== recentConversations.length) {
      setRecentConversations(filteredConversations);
    }
  };

  // Function to delete a specific conversation
  const deleteConversation = async (conversationId: string, e: React.MouseEvent) => {
    e.preventDefault(); // Prevent navigation when clicking delete button
    e.stopPropagation(); // Stop event bubbling
    
    try {
      const response = await fetch(`http://localhost:5000/api/conversations/${conversationId}`, {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
        },
      });
      
      if (!response.ok) {
        throw new Error('Failed to delete conversation');
      }
      
      // Remove conversation from local state
      const updatedConversations = recentConversations.filter(conv => conv.id !== conversationId);
      setRecentConversations(updatedConversations);
      
      // If the deleted conversation was active, navigate to chatbot home
      if (activeConversationId === conversationId) {
        setActiveConversationId(null);
        router.push('/dashboard/chatbot');
      }
      
      console.log(`Successfully deleted conversation ${conversationId}`);
    } catch (error) {
      console.error("Error deleting conversation:", error);
    }
  };

  // Add a function to explicitly remove all temporary conversations now
  const removeAllTemporaryConversations = async () => {
    try {
      // First, get the current database conversations
      const response = await fetch('http://localhost:5000/api/conversations');
      if (!response.ok) {
        throw new Error('Failed to fetch conversations');
      }
      
      const data = await response.json();
      const dbConversations = data.conversations || [];
      const dbConversationIds = new Set(dbConversations.map((c: Conversation) => c.id as string));
      
      // Filter out temporary conversations that aren't in the database
      const filteredConversations = recentConversations.filter(conv => 
        dbConversationIds.has(conv.id)
      );
      
      setRecentConversations(filteredConversations);
      
      console.log(`Removed ${recentConversations.length - filteredConversations.length} temporary conversations`);
      
      // If the active conversation was temporary, clear it
      if (activeConversationId && !dbConversationIds.has(activeConversationId)) {
        setActiveConversationId(null);
        router.push('/dashboard/chatbot');
      }
      
    } catch (error) {
      console.error("Error removing temporary conversations:", error);
    }
  };

  // Call this function to immediately remove all temporary conversations
  useEffect(() => {
    // Only run once after the initial loading of conversations
    if (!isLoading && recentConversations.length > 0) {
      removeAllTemporaryConversations();
    }
  }, [isLoading]);

  // Expose the update function and cleanup function to window for cross-component communication
  useEffect(() => {
    // @ts-ignore
    window.updateConversationTitle = updateConversationTitle;
    // @ts-ignore
    window.cleanupEmptyConversations = cleanupEmptyConversations;
    
    return () => {
      // @ts-ignore
      delete window.updateConversationTitle;
      // @ts-ignore
      delete window.cleanupEmptyConversations;
    };
  }, [recentConversations, activeConversationId]);

  // Add this useEffect near the top of the component, after other useEffect calls
  useEffect(() => {
    // Directly remove all empty conversations with title "New conversation"
    setRecentConversations(prev => 
      prev.filter(conv => conv.title !== "New conversation")
    );
    
    console.log("Cleaned up empty temporary conversations");
  }, []);

  // Add this function after other API-related functions
  const deleteEmptyConversationsFromDatabase = async () => {
    try {
      const response = await fetch('http://localhost:5000/api/conversations/cleanup', {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
        },
      });
      
      if (!response.ok) {
        throw new Error('Failed to delete empty conversations');
      }
      
      const data = await response.json();
      console.log(`Deleted ${data.deleted_count} empty conversations from database`);
      
      // Refresh the conversation list
      const conversationsResponse = await fetch('http://localhost:5000/api/conversations');
      if (conversationsResponse.ok) {
        const conversationsData = await conversationsResponse.json();
        setRecentConversations(conversationsData.conversations || []);
      }
      
    } catch (error) {
      console.error("Error deleting empty conversations:", error);
    }
  };

  // Execute once on component mount
  useEffect(() => {
    deleteEmptyConversationsFromDatabase();
  }, []);

  return (
    <div className="hidden md:flex flex-col w-[220px] border-r bg-background h-screen overflow-hidden">
      <div className="flex items-center gap-2 p-4 border-b">
        <img src="/Steeves logo-01.png" alt="Steeves & Associates" className="w-6 h-6 object-contain" />
        <span className="font-semibold text-sm">STEEVES & ASSOCIATES</span>
      </div>

      <div className="flex border-b">
        <button
          className={`flex-1 py-2 text-sm font-medium ${sidebarTab === "dashboard" ? "border-b-2 border-primary" : "text-muted-foreground"} cursor-pointer`}
          onClick={() => setSidebarTab("dashboard")}
        >
          <LayoutDashboard className="w-4 h-4 mx-auto" />
        </button>
        <button
          className={`flex-1 py-2 text-sm font-medium ${sidebarTab === "chatbot" ? "border-b-2 border-primary" : "text-muted-foreground"} cursor-pointer`}
          onClick={() => setSidebarTab("chatbot")}
        >
          <MessageSquare className="w-4 h-4 mx-auto" />
        </button>
      </div>

      <div className="flex-1 overflow-auto">
        {sidebarTab === "dashboard" && (
          <div className="py-2">
            <div className="px-3 py-1 text-xs text-muted-foreground">Business Analytics</div>
            <div className="mt-1">
              <Link href="/dashboard" passHref>
                <button className={`w-full flex items-center gap-2 px-3 py-1.5 text-sm ${activeTab === "overview" ? "bg-muted" : "hover:bg-muted"} rounded-sm cursor-pointer`}>
                  <Home className={`w-4 h-4 ${activeTab === "overview" ? "text-primary" : "text-muted-foreground"}`} />
                  <span className={activeTab === "overview" ? "font-medium" : ""}>Overview</span>
                </button>
              </Link>
              <Link href="/dashboard/seasonal-analysis" passHref>
                <button className={`w-full flex items-center gap-2 px-3 py-1.5 text-sm ${activeTab === "seasonal-analysis" ? "bg-muted" : "hover:bg-muted"} rounded-sm cursor-pointer`}>
                  <Calendar className={`w-4 h-4 ${activeTab === "seasonal-analysis" ? "text-primary" : "text-muted-foreground"}`} />
                  <span className={activeTab === "seasonal-analysis" ? "font-medium" : ""}>Seasonal Analysis</span>
                </button>
              </Link>
              <Link href="/dashboard/growth-drivers" passHref>
                <button className={`w-full flex items-center gap-2 px-3 py-1.5 text-sm ${activeTab === "growth-drivers" ? "bg-muted" : "hover:bg-muted"} rounded-sm cursor-pointer`}>
                  <TrendingUp className={`w-4 h-4 ${activeTab === "growth-drivers" ? "text-primary" : "text-muted-foreground"}`} />
                  <span className={activeTab === "growth-drivers" ? "font-medium" : ""}>Growth Drivers</span>
                </button>
              </Link>
              <Link href="/dashboard/resource-performance" passHref>
                <button className={`w-full flex items-center gap-2 px-3 py-1.5 text-sm ${activeTab === "resource-performance" ? "bg-muted" : "hover:bg-muted"} rounded-sm cursor-pointer`}>
                  <Users className={`w-4 h-4 ${activeTab === "resource-performance" ? "text-primary" : "text-muted-foreground"}`} />
                  <span className={activeTab === "resource-performance" ? "font-medium" : ""}>Resource Performance</span>
                </button>
              </Link>
              <Link href="/dashboard/project-analytics" passHref>
                <button className={`w-full flex items-center gap-2 px-3 py-1.5 text-sm ${activeTab === "project-analytics" ? "bg-muted" : "hover:bg-muted"} rounded-sm cursor-pointer`}>
                  <Target className={`w-4 h-4 ${activeTab === "project-analytics" ? "text-primary" : "text-muted-foreground"}`} />
                  <span className={activeTab === "project-analytics" ? "font-medium" : ""}>Project Analytics</span>
                </button>
              </Link>
              <Link href="/dashboard/forecasting" passHref>
                <button className={`w-full flex items-center gap-2 px-3 py-1.5 text-sm ${activeTab === "forecasting" ? "bg-muted" : "hover:bg-muted"} rounded-sm cursor-pointer`}>
                  <BarChart4 className={`w-4 h-4 ${activeTab === "forecasting" ? "text-primary" : "text-muted-foreground"}`} />
                  <span className={activeTab === "forecasting" ? "font-medium" : ""}>Forecasting</span>
                </button>
              </Link>
            </div>
          </div>
        )}

        {sidebarTab === "chatbot" && (
          <div className="flex flex-col h-full">
            <div className="p-3">
              <button onClick={createNewConversation} className="w-full flex items-center justify-center gap-2 py-2 rounded-md text-sm font-medium text-white bg-blue-500 hover:bg-blue-600 cursor-pointer">
                <Plus className="w-4 h-4" />
                <span>New Chat</span>
              </button>
            </div>
            
            <div className="flex-1 overflow-auto">
              <div className="px-3 py-1 text-xs text-muted-foreground">Recent Conversations</div>
              
              {isLoading ? (
                <div className="text-xs text-muted-foreground text-center py-3">Loading...</div>
              ) : recentConversations.length === 0 ? (
                <div className="text-xs text-muted-foreground text-center py-3">No conversations yet</div>
              ) : (
                <div className="mt-1 space-y-1">
                  {recentConversations.map((conversation) => (
                    <div key={conversation.id} className={`group flex items-center px-3 py-1.5 text-sm ${
                      activeConversationId === conversation.id ? "bg-muted" : "hover:bg-muted"
                    } rounded-sm`}>
                      <Link href={`/dashboard/chatbot?id=${conversation.id}`} className="flex-1 flex items-center gap-2 cursor-pointer min-w-0">
                        <MessageSquare className={`w-4 h-4 flex-shrink-0 ${
                          activeConversationId === conversation.id ? "text-primary" : "text-muted-foreground"
                        }`} />
                        <span className={`truncate ${activeConversationId === conversation.id ? "font-medium" : ""}`}>
                          {conversation.title}
                        </span>
                      </Link>
                      <button
                        onClick={(e) => deleteConversation(conversation.id, e)}
                        className="opacity-0 group-hover:opacity-100 p-1 hover:bg-red-100 hover:text-red-600 rounded transition-all flex-shrink-0 ml-1"
                        title="Delete conversation"
                      >
                        <Trash2 className="w-3 h-3" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
              
              <div className="mt-2 border-t pt-2">
                <Link href="/dashboard/chatbot/admin" passHref>
                  <button className="w-full flex items-center gap-2 px-3 py-1.5 text-sm hover:bg-muted rounded-sm cursor-pointer">
                    <Settings className="w-4 h-4 text-muted-foreground" />
                    <span>Settings</span>
                  </button>
                </Link>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
} 