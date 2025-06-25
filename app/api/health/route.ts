import { NextRequest, NextResponse } from 'next/server';

const API_BASE_URL = 'http://127.0.0.1:5000';

// Handler for GET requests to check health
export async function GET(request: NextRequest) {
  try {
    // Forward the request to the Flask backend
    const response = await fetch(`${API_BASE_URL}/api/health`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      },
    });
    
    if (!response.ok) {
      return NextResponse.json(
        { 
          status: "error", 
          message: 'Backend service is not available',
        }, 
        { status: response.status }
      );
    }
    
    const data = await response.json();
    return NextResponse.json(data);
  } catch (error) {
    console.error('Error in health API route:', error);
    return NextResponse.json(
      { 
        status: "error", 
        message: 'Unable to connect to backend service',
      }, 
      { status: 500 }
    );
  }
} 