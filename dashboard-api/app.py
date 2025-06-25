from flask import Flask, request, jsonify
from flask_cors import CORS
import psycopg2
from psycopg2.extras import RealDictCursor
import os
import logging
from dotenv import load_dotenv
import pandas as pd
import numpy as np
from statsmodels.tsa.holtwinters import ExponentialSmoothing
from sklearn.metrics import mean_absolute_percentage_error, mean_absolute_error, mean_squared_error, r2_score
from statsmodels.tsa.seasonal import seasonal_decompose
import traceback
import time
from event_loop_manager import async_manager
from optimized_query_engine import optimized_query_engine
from performance_monitor import performance_monitor
from statsmodels.tsa.stattools import acf, pacf
# Keep conversation DB from original app.py
from modules.db import Database
# Load environment variables from .env file
load_dotenv()

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = Flask(__name__)
CORS(app)  # Enable CORS for all routes

# --- Database configuration for Analytics (from seasonal_analysis_flask.py) ---
DB_CONFIG = {
    'host': os.getenv('DB_HOST'),
    'database': os.getenv('DB_NAME'),
    'user': os.getenv('DB_USER'),
    'password': os.getenv('DB_PASSWORD'),
    'port': os.getenv('DB_PORT'),
    'connect_timeout': 10  # Add a 10-second connection timeout
}

def get_db_connection():
    """Get database connection with error handling and env var validation"""
    try:
        config = DB_CONFIG.copy()
        required_vars = ['host', 'database', 'user', 'password', 'port']
        missing_vars = [key for key in required_vars if not config.get(key)]
        if missing_vars:
            raise ValueError(f"Missing required database environment variables: {', '.join(missing_vars)}")
        
        config['port'] = int(config['port'])  # Convert port to int after validation
        
        conn = psycopg2.connect(**config)
        return conn
    except (psycopg2.Error, ValueError, TypeError) as e:
        logger.error(f"Database connection error: {e}")
        raise

# --- Database for Conversations (from original app.py) ---
db = Database()

def build_where_clause(customers=None, projects=None, resources=None, start_date=None, end_date=None):
    """Build dynamic WHERE clause based on filters"""
    where_parts = []
    params = []
    
    if customers and len(customers) > 0 and 'all' not in customers:
        where_parts.append("customer_name = ANY(%s)")
        params.append(customers)
    
    if projects and len(projects) > 0 and 'all' not in projects:
        where_parts.append("project = ANY(%s)")
        params.append(projects)
    
    if resources and len(resources) > 0 and 'all' not in resources:
        where_parts.append("resource_name = ANY(%s)")
        params.append(resources)
    
    if start_date:
        where_parts.append("worked_date >= %s")
        params.append(start_date)
    
    if end_date:
        where_parts.append("worked_date <= %s")
        params.append(end_date)
    
    where_clause = " AND ".join(where_parts) if where_parts else "1=1"
    return where_clause, params

def parse_filters(request):
    """Parse filter parameters from request"""
    customers = request.args.get('customers', '').split(',') if request.args.get('customers') else []
    projects = request.args.get('projects', '').split(',') if request.args.get('projects') else []
    resources = request.args.get('resources', '').split(',') if request.args.get('resources') else []
    start_date = request.args.get('startDate')
    end_date = request.args.get('endDate')
    
    # Clean up empty strings
    customers = [c.strip() for c in customers if c.strip()]
    projects = [p.strip() for p in projects if p.strip()]
    resources = [r.strip() for r in resources if r.strip()]
    
    return customers, projects, resources, start_date, end_date

# Health check endpoint
@app.route('/api/health', methods=['GET'])
def health_check():
    db_status = 'disconnected'
    rag_status = 'disconnected'
    
    try:
        conn = get_db_connection()
        cursor = conn.cursor()
        cursor.execute("SELECT 1")
        cursor.close()
        conn.close()
        db_status = 'connected'
    except Exception as e:
        logger.error(f"Health check DB error: {e}")
        pass
    
    try:
        # Check if the async manager is healthy
        if async_manager.is_healthy():
            rag_status = 'connected'
        else:
            rag_status = 'disconnected'
    except Exception as e:
        logger.error(f"Health check RAG error: {e}")
        rag_status = 'error'
    
    return jsonify({
        "status": "healthy", 
        "service": "chatbot-api", 
        "database": db_status,
        "rag_system": rag_status
    })

# Performance metrics endpoint
@app.route('/api/performance', methods=['GET'])
def get_performance_metrics():
    try:
        # Get comprehensive performance data
        health_status = performance_monitor.get_health_status()
        detailed_stats = performance_monitor.get_current_stats()
        
        # Get manager statuses
        async_manager_status = async_manager.get_status()
        
        return jsonify({
            "health": health_status,
            "performance": detailed_stats,
            "managers": {
                "async_manager": async_manager_status,
                "query_engine_cache": optimized_query_engine.get_cache_stats()
            },
            "timestamp": time.time()
        })
    except Exception as e:
        logger.error(f"Error getting performance metrics: {e}")
        return jsonify({"error": str(e)}), 500

# Cache management endpoint
@app.route('/api/cache/clear', methods=['POST'])
def clear_cache():
    try:
        optimized_query_engine.clear_cache()
        performance_monitor.reset_metrics()
        return jsonify({"success": True, "message": "Cache cleared successfully"})
    except Exception as e:
        logger.error(f"Error clearing cache: {e}")
        return jsonify({"error": str(e)}), 500


# API route to get conversations
@app.route('/api/conversations', methods=['GET'])
def get_conversations():
    try:
        conversations = db.get_conversations()
        return jsonify({"conversations": conversations})
    except Exception as e:
        logger.error(f"Error getting conversations: {str(e)}")
        return jsonify({"error": str(e)}), 500

# API endpoint to get a specific conversation
@app.route('/api/conversations/<conversation_id>', methods=['GET'])
def get_conversation(conversation_id):
    try:
        conversation = db.get_conversation(conversation_id)
        if conversation:
            return jsonify(conversation)
        else:
            return jsonify({"error": "Conversation not found"}), 404
    except Exception as e:
        logger.error(f"Error getting conversation {conversation_id}: {str(e)}")
        return jsonify({"error": str(e)}), 500

# API endpoint to create a new conversation
@app.route('/api/conversations', methods=['POST'])
def create_conversation():
    try:
        data = request.json
        if not data or 'id' not in data or 'title' not in data:
            return jsonify({"error": "Missing required fields"}), 400
        
        conversation = db.create_conversation(data['id'], data['title'])
        return jsonify(conversation), 201
    except Exception as e:
        logger.error(f"Error creating conversation: {str(e)}")
        return jsonify({"error": str(e)}), 500

# API endpoint to update a conversation title
@app.route('/api/conversations/<conversation_id>/title', methods=['PUT'])
def update_conversation_title(conversation_id):
    try:
        data = request.json
        if not data or 'title' not in data:
            return jsonify({"error": "Missing title field"}), 400
        
        success = db.update_conversation_title(conversation_id, data['title'])
        if success:
            return jsonify({"success": True})
        else:
            return jsonify({"error": "Conversation not found"}), 404
    except Exception as e:
        logger.error(f"Error updating conversation title: {str(e)}")
        return jsonify({"error": str(e)}), 500

# API endpoint to delete a conversation
@app.route('/api/conversations/<conversation_id>', methods=['DELETE'])
def delete_conversation(conversation_id):
    try:
        success = db.delete_conversation(conversation_id)
        if success:
            return jsonify({"success": True})
        else:
            return jsonify({"error": "Conversation not found"}), 404
    except Exception as e:
        logger.error(f"Error deleting conversation: {str(e)}")
        return jsonify({"error": str(e)}), 500

# API endpoint to add a message to a conversation
@app.route('/api/conversations/<conversation_id>/messages', methods=['POST'])
def add_message(conversation_id):
    try:
        data = request.json
        if not data or 'role' not in data or 'content' not in data:
            return jsonify({"error": "Missing required fields"}), 400
        
        retrieved_docs = data.get('retrieved_docs')
        success = db.add_message(conversation_id, data['role'], data['content'], retrieved_docs)
        
        if success:
            return jsonify({"success": True})
        else:
            return jsonify({"error": "Conversation not found"}), 404
    except Exception as e:
        logger.error(f"Error adding message: {str(e)}")
        return jsonify({"error": str(e)}), 500

# Update the chat API endpoint to call the RAG logic directly
# We change this to a synchronous endpoint to gain control over the event loop.
@app.route('/api/chat', methods=['POST'])
def chat():
    try:
        data = request.json
        if not data or 'query' not in data:
            return jsonify({"error": "Missing query field"}), 400
        
        conversation_id = data.get('conversation_id')
        if not conversation_id:
            return jsonify({"error": "Missing conversation_id field"}), 400
        
        query = data['query']
        mode = data.get('mode', 'enhanced') # Get mode from request, default to enhanced

        conversation = db.get_conversation(conversation_id)
        if not conversation:
            title = query[:50] + ('...' if len(query) > 50 else '')
            db.create_conversation(conversation_id, title)
        
        # Note: User message is already added by the frontend
        
        # --- Use Optimized Query Engine with all performance enhancements ---
        # This combines FlaskAsyncManager, GeminiClientManager, RAGManager, and PerformanceMonitor
        try:
            # Use the optimized query engine instead of the original query_rag
            answer = optimized_query_engine.query_with_optimizations(query, mode)
            response_text = answer
            retrieved_docs = [] # Docs are handled internally now
        except Exception as e:
            logger.error(f"Error in optimized chatbot call: {e}")
            logger.error(traceback.format_exc())
            response_text = f"I encountered an error while processing your request. Please try again or contact support if the issue persists."
        # -------------------------------------------------------------------

        # Store the assistant's response in the database
        db.add_message(conversation_id, 'assistant', response_text, retrieved_docs)
        
        # Update conversation title
        if conversation is None or (conversation and len(conversation.get('messages', [])) <= 1):
            new_title = query[:50] + ('...' if len(query) > 50 else '')
            db.update_conversation_title(conversation_id, new_title)
        
        return jsonify({
            "response": response_text,
            "retrieved_documents": retrieved_docs
        })
    except Exception as e:
        logger.error(f"Error in chat endpoint: {str(e)}")
        logger.error(traceback.format_exc())
        return jsonify({"error": str(e)}), 500

@app.route('/api/conversations/cleanup', methods=['DELETE', 'POST', 'OPTIONS'])
def cleanup_conversations():
    """Handle conversation cleanup requests"""
    if request.method == 'OPTIONS':
        return '', 200
    try:
        return jsonify({'success': True, 'message': 'Cleanup completed'})
    except Exception as e:
        logger.error(f"Error in conversation cleanup: {e}")
        return jsonify({'error': str(e)}), 500

@app.route('/api/rag/reset', methods=['POST'])
def reset_rag_system():
    """
    This endpoint is now effectively a no-op since RAG is initialized per-request.
    It can be kept for compatibility or removed.
    """
    return jsonify({
        "message": "RAG system is now stateless and initialized per-request. No reset needed.",
        "success": True
    })

# ======= Analytics Endpoints from seasonal_analysis_flask.py =======

@app.route('/api/project-data', methods=['GET'])
def get_project_data():
    """Get all project data for React frontend"""
    try:
        conn = get_db_connection()
        cursor = conn.cursor(cursor_factory=RealDictCursor)
        
        query = """
        SELECT 
            customer_name as "Customer Name",
            project as "Project", 
            worked_date as "Worked Date",
            task_title as "Task or Ticket Title",
            resource_name as "Resource Name",
            billable_hours as "Billable Hours",
            hourly_rate as "Hourly Billing Rate", 
            revenue as "Extended Price",
            customer_category as "Detailed Customer Category"
        FROM project_data 
        ORDER BY worked_date DESC
        """
        
        cursor.execute(query)
        results = cursor.fetchall()
        
        cursor.close()
        conn.close()
        
        return jsonify(results)
        
    except Exception as e:
        logger.error(f"Error getting project data: {e}")
        return jsonify({'error': str(e)}), 500

@app.route('/api/project-stats', methods=['GET'])
def get_project_stats():
    """Get aggregated project statistics for React frontend"""
    try:
        conn = get_db_connection()
        cursor = conn.cursor(cursor_factory=RealDictCursor)
        
        query = """
        WITH stats AS (
            SELECT 
                SUM(revenue) as total_revenue,
                COUNT(DISTINCT project) as total_projects,
                COUNT(DISTINCT customer_name) as total_customers,
                SUM(billable_hours) as total_hours,
                AVG(hourly_rate) as avg_hourly_rate
            FROM project_data
        ),
        customer_categories AS (
            SELECT 
                customer_category,
                COUNT(*) as count
            FROM project_data
            GROUP BY customer_category
        ),
        revenue_by_customer AS (
            SELECT 
                customer_name,
                SUM(revenue) as revenue
            FROM project_data
            GROUP BY customer_name
        ),
        revenue_by_project AS (
            SELECT 
                project,
                SUM(revenue) as revenue
            FROM project_data
            GROUP BY project
        ),
        monthly_revenue AS (
            SELECT 
                TO_CHAR(worked_date, 'YYYY-MM') as month,
                SUM(revenue) as revenue
            FROM project_data
            GROUP BY TO_CHAR(worked_date, 'YYYY-MM')
        )
        SELECT 
            (SELECT row_to_json(stats.*) FROM stats) as stats,
            (SELECT json_object_agg(customer_category, count) FROM customer_categories) as customer_categories,
            (SELECT json_object_agg(customer_name, revenue) FROM revenue_by_customer) as revenue_by_customer,
            (SELECT json_object_agg(project, revenue) FROM revenue_by_project) as revenue_by_project,
            (SELECT json_object_agg(month, revenue) FROM monthly_revenue) as monthly_revenue
        """
        
        cursor.execute(query)
        result = cursor.fetchone()
        
        if result and result['stats']:
            stats = result['stats']
            response = {
                'total_revenue': float(stats['total_revenue']) if stats['total_revenue'] else 0,
                'total_projects': stats['total_projects'] if stats['total_projects'] else 0,
                'total_customers': stats['total_customers'] if stats['total_customers'] else 0,
                'total_hours': float(stats['total_hours']) if stats['total_hours'] else 0,
                'avg_hourly_rate': float(stats['avg_hourly_rate']) if stats['avg_hourly_rate'] else 0,
                'customer_categories': result['customer_categories'] or {},
                'revenue_by_customer': result['revenue_by_customer'] or {},
                'revenue_by_project': result['revenue_by_project'] or {},
                'monthly_revenue': result['monthly_revenue'] or {}
            }
        else:
            response = {
                'total_revenue': 0, 'total_projects': 0, 'total_customers': 0,
                'total_hours': 0, 'avg_hourly_rate': 0, 'customer_categories': {},
                'revenue_by_customer': {}, 'revenue_by_project': {}, 'monthly_revenue': {}
            }
        
        cursor.close()
        conn.close()
        
        return jsonify(response)
        
    except Exception as e:
        logger.error(f"Error getting project stats: {e}")
        return jsonify({'error': str(e)}), 500

@app.route('/api/seasonal-analysis', methods=['GET'])
def seasonal_analysis():
    """Main seasonal analysis endpoint"""
    try:
        customers, projects, resources, start_date, end_date = parse_filters(request)
        where_clause, params = build_where_clause(customers, projects, resources, start_date, end_date)
        
        conn = get_db_connection()
        cursor = conn.cursor(cursor_factory=RealDictCursor)
        
        query = f"""
        WITH monthly_data AS (
            SELECT 
                EXTRACT(MONTH FROM worked_date) as month_num,
                TRIM(TO_CHAR(worked_date, 'Month')) as month_name,
                TO_CHAR(worked_date, 'Mon') as month_short,
                SUM(revenue) as revenue,
                SUM(billable_hours) as hours,
                COUNT(DISTINCT project) as project_count
            FROM project_data 
            WHERE {where_clause}
            GROUP BY 1, 2, 3
            ORDER BY 1
        ),
        ranked_months AS (
            SELECT *,
                ROW_NUMBER() OVER (ORDER BY revenue ASC) as revenue_rank
            FROM monthly_data
        ),
        seasonal_stats AS (
            SELECT 
                MIN(revenue) as min_revenue,
                MAX(revenue) as max_revenue,
                AVG(revenue) as avg_revenue
            FROM monthly_data
        )
        SELECT 
            rm.*,
            CASE WHEN rm.revenue_rank <= 3 THEN true ELSE false END as is_low_season,
            ss.min_revenue,
            ss.max_revenue,
            ss.avg_revenue,
            CASE 
                WHEN ss.avg_revenue > 0 
                THEN ((ss.max_revenue - ss.min_revenue) / ss.avg_revenue * 100)
                ELSE 0 
            END as seasonal_variance
        FROM ranked_months rm, seasonal_stats ss
        ORDER BY rm.month_num
        """
        
        cursor.execute(query, params)
        results = cursor.fetchall()
        
        if not results:
            return jsonify({
                'monthlyChartData': [],
                'seasonalKpis': {'lowSeasonCount': 0, 'lowSeasonImpact': 0, 'seasonalVariance': 0, 'highestMonth': {'monthName': 'N/A', 'revenue': 0}, 'lowestMonth': {'monthName': 'N/A', 'revenue': 0}},
                'lowSeasonDetails': []
            })
        
        monthly_chart_data = []
        low_season_details = []
        total_revenue = sum(row['revenue'] for row in results)
        low_season_revenue = 0
        highest_month = max(results, key=lambda x: x['revenue'])
        lowest_month = min(results, key=lambda x: x['revenue'])
        
        for row in results:
            monthly_chart_data.append({
                'month': row['month_short'],
                'fullMonth': row['month_name'].strip(),
                'revenue': float(row['revenue']),
                'hours': float(row['hours']),
                'projectCount': row['project_count'],
                'isLowSeason': row['is_low_season']
            })
            
            if row['is_low_season']:
                low_season_revenue += row['revenue']
                low_season_details.append({
                    'monthName': row['month_name'].strip(),
                    'revenue': float(row['revenue']),
                    'hours': float(row['hours']),
                    'projectCount': row['project_count']
                })
        
        seasonal_kpis = {
            'lowSeasonCount': len(low_season_details),
            'lowSeasonImpact': float((low_season_revenue / total_revenue * 100)) if total_revenue > 0 else 0.0,
            'seasonalVariance': float(results[0]['seasonal_variance']) if results else 0.0,
            'highestMonth': {'monthName': highest_month['month_name'].strip(), 'revenue': float(highest_month['revenue'])},
            'lowestMonth': {'monthName': lowest_month['month_name'].strip(), 'revenue': float(lowest_month['revenue'])}
        }
        
        cursor.close()
        conn.close()
        
        return jsonify({
            'monthlyChartData': monthly_chart_data,
            'seasonalKpis': seasonal_kpis,
            'lowSeasonDetails': sorted(low_season_details, key=lambda x: x['revenue'])
        })
        
    except Exception as e:
        logger.error(f"Error in seasonal analysis: {e}")
        return jsonify({'error': str(e)}), 500

@app.route('/api/seasonal-analysis/customer-performance', methods=['GET'])
def customer_performance():
    """Customer performance during low seasons"""
    try:
        customers, projects, resources, start_date, end_date = parse_filters(request)
        where_clause, params = build_where_clause(customers, projects, resources, start_date, end_date)
        
        conn = get_db_connection()
        cursor = conn.cursor(cursor_factory=RealDictCursor)
        
        query = f"""
        WITH monthly_revenue AS (
            SELECT EXTRACT(MONTH FROM worked_date) as month_num FROM project_data WHERE {where_clause} GROUP BY 1 ORDER BY SUM(revenue) ASC LIMIT 3
        ),
        customer_low_season_performance AS (
            SELECT 
                pd.customer_category,
                pd.customer_name,
                SUM(pd.revenue) as low_season_revenue,
                SUM(pd.billable_hours) as low_season_hours,
                COUNT(DISTINCT pd.project) as project_count
            FROM project_data pd
            JOIN monthly_revenue lsm ON EXTRACT(MONTH FROM pd.worked_date) = lsm.month_num
            WHERE {where_clause} AND pd.customer_category IS NOT NULL AND TRIM(pd.customer_category) != ''
            GROUP BY 1, 2
        )
        SELECT customer_category, customer_name, low_season_revenue, low_season_hours, project_count
        FROM customer_low_season_performance
        WHERE low_season_revenue > 0
        """
        
        cursor.execute(query, params + params)
        results = cursor.fetchall()
        
        # Format for treemap
        tree_map_data_agg = {}
        for row in results:
            category = row['customer_category']
            if category not in tree_map_data_agg:
                tree_map_data_agg[category] = {'name': category, 'children': []}
            
            tree_map_data_agg[category]['children'].append({
                'name': row['customer_name'],
                'value': float(row['low_season_revenue']),
                'hours': float(row['low_season_hours']),
                'projects': row['project_count']
            })

        tree_map_data = list(tree_map_data_agg.values())
        for category_data in tree_map_data:
            category_data['value'] = sum(child['value'] for child in category_data['children'])
        
        cursor.close()
        conn.close()
        
        return jsonify({'treeMapData': sorted(tree_map_data, key=lambda x: x['value'], reverse=True)})
        
    except Exception as e:
        logger.error(f"Error in customer performance: {e}")
        return jsonify({'error': str(e)}), 500

@app.route('/api/seasonal-analysis/customers-in-category', methods=['GET'])
def customers_in_category():
    """Get top customers within a specific category during low seasons"""
    try:
        customers, projects, resources, start_date, end_date = parse_filters(request)
        where_clause, params = build_where_clause(customers, projects, resources, start_date, end_date)
        
        # Get the category parameter
        category = request.args.get('category', '').strip()
        if not category:
            return jsonify({'error': 'Category parameter is required'}), 400
        
        conn = get_db_connection()
        cursor = conn.cursor(cursor_factory=RealDictCursor)
        
        # First, get the bottom 3 months by revenue, then find top customers in that category for those months
        query = f"""
        WITH monthly_revenue AS (
            SELECT 
                EXTRACT(MONTH FROM worked_date) as month_num,
                SUM(revenue) as total_revenue
            FROM project_data 
            WHERE {where_clause}
            GROUP BY EXTRACT(MONTH FROM worked_date)
        ),
        low_season_months AS (
            SELECT month_num 
            FROM monthly_revenue
            ORDER BY total_revenue ASC
            LIMIT 3
        ),
        customer_low_season_performance AS (
            SELECT 
                pd.customer_name,
                SUM(pd.revenue) as low_season_revenue,
                SUM(pd.billable_hours) as low_season_hours,
                COUNT(DISTINCT EXTRACT(MONTH FROM pd.worked_date)) as low_season_months_active
            FROM project_data pd
            INNER JOIN low_season_months lsm ON EXTRACT(MONTH FROM pd.worked_date) = lsm.month_num
            WHERE {where_clause} AND pd.customer_category = %s
            GROUP BY pd.customer_name
        )
        SELECT 
            customer_name,
            low_season_revenue,
            low_season_hours,
            low_season_months_active
        FROM customer_low_season_performance
        WHERE customer_name IS NOT NULL AND TRIM(customer_name) != '' AND low_season_revenue > 0
        ORDER BY low_season_revenue DESC
        LIMIT 5
        """
        
        # Add category parameter to params (where_clause is used twice)
        all_params = params + params + [category]
        cursor.execute(query, all_params)
        results = cursor.fetchall()
        
        # Format for chart
        customer_data = [
            {
                'name': row['customer_name'],
                'value': float(row['low_season_revenue']),
                'hours': float(row['low_season_hours']),
                'months': row['low_season_months_active']
            }
            for row in results
        ]
        
        cursor.close()
        conn.close()
        
        return jsonify({
            'customerData': customer_data,
            'category': category
        })
        
    except Exception as e:
        logger.error(f"Error in customers in category: {e}")
        return jsonify({'error': str(e)}), 500
    
@app.route('/api/seasonal-analysis/top-projects', methods=['GET'])
def top_projects():
    """Top performing projects in low seasons"""
    try:
        customers, projects, resources, start_date, end_date = parse_filters(request)
        where_clause, params = build_where_clause(customers, projects, resources, start_date, end_date)
        
        conn = get_db_connection()
        cursor = conn.cursor(cursor_factory=RealDictCursor)
        
        query = f"""
        WITH low_season_months AS (
            SELECT EXTRACT(MONTH FROM worked_date) as month_num FROM project_data WHERE {where_clause} GROUP BY 1 ORDER BY SUM(revenue) ASC LIMIT 3
        ),
        project_performance AS (
            SELECT 
                pd.project,
                pd.customer_name,
                SUM(pd.revenue) as revenue,
                SUM(pd.billable_hours) as hours
            FROM project_data pd
            JOIN low_season_months lsm ON EXTRACT(MONTH FROM pd.worked_date) = lsm.month_num
            WHERE {where_clause} AND pd.project IS NOT NULL AND TRIM(pd.project) != ''
            GROUP BY 1, 2
        )
        SELECT project, customer_name, revenue, hours
        FROM project_performance
        WHERE revenue > 0
        ORDER BY revenue DESC
        LIMIT 8
        """
        
        cursor.execute(query, params + params)
        results = cursor.fetchall()
        
        top_projects_data = [{
            'project': row['project'][:35] + '...' if len(row['project']) > 35 else row['project'],
            'fullProject': row['project'],
            'customer': row['customer_name'],
            'revenue': float(row['revenue']),
            'hours': float(row['hours'])
        } for row in results]
        
        cursor.close()
        conn.close()
        
        return jsonify({'topProjects': top_projects_data})
        
    except Exception as e:
        logger.error(f"Error in top projects: {e}")
        return jsonify({'error': str(e)}), 500

@app.route('/api/seasonal-analysis/revenue-hours-trend', methods=['GET'])
def revenue_hours_trend():
    """Revenue vs hours trend analysis"""
    try:
        customers, projects, resources, start_date, end_date = parse_filters(request)
        where_clause, params = build_where_clause(customers, projects, resources, start_date, end_date)
        
        conn = get_db_connection()
        cursor = conn.cursor(cursor_factory=RealDictCursor)
        
        query = f"""
        WITH monthly_data AS (
            SELECT 
                TO_CHAR(worked_date, 'YYYY-MM') as month_period,
                TO_CHAR(worked_date, 'Mon YY') as month_label,
                SUM(revenue) as revenue,
                SUM(billable_hours) as hours
            FROM project_data 
            WHERE {where_clause}
            GROUP BY 1, 2
            ORDER BY 1
        ),
        ranked_months AS (
            SELECT *, ROW_NUMBER() OVER (ORDER BY revenue ASC) as revenue_rank
            FROM monthly_data
        )
        SELECT 
            month_label as month,
            revenue,
            hours,
            CASE WHEN revenue_rank <= 3 THEN true ELSE false END as is_low_season
        FROM ranked_months
        """
        
        cursor.execute(query, params)
        results = cursor.fetchall()
        
        trend_data = [{'month': r['month'], 'revenue': float(r['revenue']), 'hours': float(r['hours']), 'isLowSeason': r['is_low_season']} for r in results]
        
        cursor.close()
        conn.close()
        
        return jsonify({'trendData': trend_data})
        
    except Exception as e:
        logger.error(f"Error in revenue hours trend: {e}")
        return jsonify({'error': str(e)}), 500

@app.route('/api/seasonal-analysis/hours-by-category', methods=['GET'])
def hours_by_category():
    """Hours distribution by customer category"""
    try:
        customers, projects, resources, start_date, end_date = parse_filters(request)
        where_clause, params = build_where_clause(customers, projects, resources, start_date, end_date)
        
        conn = get_db_connection()
        cursor = conn.cursor(cursor_factory=RealDictCursor)
        
        # First get all categories
        categories_query = f"""
        SELECT DISTINCT customer_category 
        FROM project_data 
        WHERE {where_clause}
        ORDER BY customer_category
        """
        
        cursor.execute(categories_query, params)
        categories = [row['customer_category'] for row in cursor.fetchall()]
        
        # Get monthly data by category
        query = f"""
        SELECT 
            EXTRACT(MONTH FROM worked_date) as month_num,
            TO_CHAR(worked_date, 'Mon') as month,
            customer_category,
            SUM(billable_hours) as hours
        FROM project_data 
        WHERE {where_clause}
        GROUP BY EXTRACT(MONTH FROM worked_date), TO_CHAR(worked_date, 'Mon'), customer_category
        ORDER BY month_num, customer_category
        """
        
        cursor.execute(query, params)
        results = cursor.fetchall()
        
        # Organize data by month
        monthly_data = {}
        for row in results:
            month = row['month']
            if month not in monthly_data:
                monthly_data[month] = {'month': month}
            
            # Clean category name for use as object key
            category_key = row['customer_category'].replace('/', '_').replace(' ', '_')
            monthly_data[month][category_key] = float(row['hours'])
        
        # Ensure all months have all categories (fill with 0 if missing)
        for month_data in monthly_data.values():
            for category in categories:
                category_key = category.replace('/', '_').replace(' ', '_')
                if category_key not in month_data:
                    month_data[category_key] = 0
        
        stacked_data = list(monthly_data.values())
        stacked_data.sort(key=lambda x: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 
                                       'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'].index(x['month']))
        
        cursor.close()
        conn.close()
        
        return jsonify({
            'stackedData': stacked_data,
            'categories': categories
        })
        
    except Exception as e:
        logger.error(f"Error in hours by category: {e}")
        return jsonify({'error': str(e)}), 500

@app.route('/api/seasonal-analysis/yoy-growth', methods=['GET'])
def yoy_monthly_growth():
    """Year-over-Year Monthly Growth Rate calculation"""
    try:
        customers, projects, resources, start_date, end_date = parse_filters(request)
        where_clause, params = build_where_clause(customers, projects, resources, start_date, end_date)
        
        conn = get_db_connection()
        cursor = conn.cursor(cursor_factory=RealDictCursor)
        
        # YoY Growth calculation query
        query = f"""
        WITH monthly_yearly_data AS (
            SELECT 
                EXTRACT(YEAR FROM worked_date) as year,
                EXTRACT(MONTH FROM worked_date) as month_num,
                TRIM(TO_CHAR(worked_date, 'Month')) as month_name,
                TO_CHAR(worked_date, 'Mon') as month_short,
                SUM(revenue) as revenue
            FROM project_data 
            WHERE {where_clause}
            GROUP BY EXTRACT(YEAR FROM worked_date), EXTRACT(MONTH FROM worked_date), 
                     TRIM(TO_CHAR(worked_date, 'Month')), TO_CHAR(worked_date, 'Mon')
        ),
        yoy_calculations AS (
            SELECT 
                current_year.year,
                current_year.month_num,
                current_year.month_name,
                current_year.month_short,
                current_year.revenue as current_revenue,
                previous_year.revenue as previous_revenue,
                CASE 
                    WHEN previous_year.revenue > 0 
                    THEN ((current_year.revenue - previous_year.revenue) / previous_year.revenue * 100)
                    ELSE NULL 
                END as growth_rate
            FROM monthly_yearly_data current_year
            LEFT JOIN monthly_yearly_data previous_year 
                ON current_year.month_num = previous_year.month_num 
                AND current_year.year = previous_year.year + 1
            WHERE previous_year.revenue IS NOT NULL
        ),
        average_growth_by_month AS (
            SELECT 
                month_num,
                month_short,
                month_name,
                AVG(growth_rate) as avg_growth_rate,
                COUNT(*) as year_count
            FROM yoy_calculations
            WHERE growth_rate IS NOT NULL
            GROUP BY month_num, month_short, month_name
            ORDER BY month_num
        )
        SELECT 
            month_short as month,
            month_name as full_month,
            avg_growth_rate as growth_rate,
            year_count
        FROM average_growth_by_month
        """
        
        cursor.execute(query, params)
        results = cursor.fetchall()
        
        yoy_data = [
            {
                'month': row['month'],
                'fullMonth': row['full_month'].strip(),
                'growthRate': float(row['growth_rate']) if row['growth_rate'] else 0,
                'yearCount': row['year_count']
            }
            for row in results
        ]
        
        cursor.close()
        conn.close()
        
        return jsonify({'yoyGrowthData': yoy_data})
        
    except Exception as e:
        logger.error(f"Error in YoY growth calculation: {e}")
        return jsonify({'error': str(e)}), 500

@app.route('/api/seasonal-analysis/yearly-month-data', methods=['GET'])
def yearly_month_data():
    """Get yearly revenue data for a specific month"""
    try:
        customers, projects, resources, start_date, end_date = parse_filters(request)
        where_clause, params = build_where_clause(customers, projects, resources, start_date, end_date)
        
        # Get the month parameter
        month_name = request.args.get('month', '').strip()
        if not month_name:
            return jsonify({'error': 'Month parameter is required'}), 400
        
        conn = get_db_connection()
        cursor = conn.cursor(cursor_factory=RealDictCursor)
        
        # Get yearly data for the specific month
        query = f"""
        SELECT 
            EXTRACT(YEAR FROM worked_date) as year,
            SUM(revenue) as revenue,
            SUM(billable_hours) as hours,
            COUNT(DISTINCT project) as project_count
        FROM project_data 
        WHERE {where_clause}
        AND TRIM(TO_CHAR(worked_date, 'Month')) = %s
        GROUP BY EXTRACT(YEAR FROM worked_date)
        ORDER BY year
        """
        
        # Add month parameter to params
        all_params = params + [month_name]
        cursor.execute(query, all_params)
        results = cursor.fetchall()
        
        yearly_data = [
            {
                'year': str(int(row['year'])),
                'revenue': float(row['revenue']),
                'hours': float(row['hours']),
                'projectCount': row['project_count']
            }
            for row in results
        ]
        
        cursor.close()
        conn.close()
        
        return jsonify({
            'yearlyData': yearly_data,
            'month': month_name
        })
        
    except Exception as e:
        logger.error(f"Error in yearly month data: {e}")
        return jsonify({'error': str(e)}), 500

# @app.route('/health', methods=['GET'])
# def health_check():
#     """Health check endpoint"""
#     try:
#         conn = get_db_connection()
#         cursor = conn.cursor()
#         cursor.execute("SELECT 1")
#         cursor.close()
#         conn.close()
#         return jsonify({'status': 'healthy', 'database': 'connected'})
#     except Exception as e:
#         return jsonify({'status': 'unhealthy', 'error': str(e)}), 500

# ======= GROWTH DRIVERS ENDPOINTS =======

@app.route('/api/growth-drivers', methods=['GET'])
def growth_drivers():
    """Main growth drivers analysis endpoint"""
    try:
        customers, projects, resources, start_date, end_date = parse_filters(request)
        where_clause, params = build_where_clause(customers, projects, resources, start_date, end_date)
        
        conn = get_db_connection()
        cursor = conn.cursor(cursor_factory=RealDictCursor)
        
        # Annual growth analysis query
        query = f"""
        WITH yearly_data AS (
            SELECT 
                EXTRACT(YEAR FROM worked_date) as year,
                SUM(revenue) as revenue,
                SUM(billable_hours) as hours,
                COUNT(DISTINCT project) as project_count,
                COUNT(DISTINCT customer_name) as customer_count
            FROM project_data 
            WHERE {where_clause}
            GROUP BY EXTRACT(YEAR FROM worked_date)
            ORDER BY year
        ),
        yoy_growth AS (
            SELECT 
                current_year.year,
                current_year.revenue,
                current_year.hours,
                current_year.project_count,
                current_year.customer_count,
                previous_year.revenue as previous_revenue,
                CASE 
                    WHEN previous_year.revenue > 0 
                    THEN ((current_year.revenue - previous_year.revenue) / previous_year.revenue * 100)
                    ELSE 0 
                END as yoy_growth_rate
            FROM yearly_data current_year
            LEFT JOIN yearly_data previous_year 
                ON current_year.year = previous_year.year + 1
        )
        SELECT 
            year,
            revenue,
            hours,
            project_count,
            customer_count,
            yoy_growth_rate
        FROM yoy_growth
        ORDER BY year
        """
        
        cursor.execute(query, params)
        results = cursor.fetchall()
        
        annual_growth_data = [
            {
                'year': str(int(row['year'])),
                'revenue': float(row['revenue']),
                'hours': float(row['hours']),
                'yoyGrowthRate': float(row['yoy_growth_rate']) if row['yoy_growth_rate'] else 0,
                'projectCount': row['project_count'],
                'customerCount': row['customer_count']
            }
            for row in results
        ]
        
        cursor.close()
        conn.close()
        
        return jsonify({
            'annualGrowthData': annual_growth_data
        })
        
    except Exception as e:
        logger.error(f"Error in growth drivers analysis: {e}")
        return jsonify({'error': str(e)}), 500

@app.route('/api/growth-drivers/category-growth', methods=['GET'])
def category_growth():
    """Revenue growth by customer category over time"""
    try:
        customers, projects, resources, start_date, end_date = parse_filters(request)
        where_clause, params = build_where_clause(customers, projects, resources, start_date, end_date)
        
        conn = get_db_connection()
        cursor = conn.cursor(cursor_factory=RealDictCursor)
        
        # Get all categories first
        categories_query = f"""
        SELECT DISTINCT customer_category 
        FROM project_data 
        WHERE {where_clause} AND customer_category IS NOT NULL AND TRIM(customer_category) != ''
        ORDER BY customer_category
        """
        
        cursor.execute(categories_query, params)
        categories = [row['customer_category'] for row in cursor.fetchall()]
        
        # Get yearly revenue by category
        query = f"""
        SELECT 
            EXTRACT(YEAR FROM worked_date) as year,
            customer_category,
            SUM(revenue) as revenue
        FROM project_data 
        WHERE {where_clause} AND customer_category IS NOT NULL AND TRIM(customer_category) != ''
        GROUP BY EXTRACT(YEAR FROM worked_date), customer_category
        ORDER BY year, customer_category
        """
        
        cursor.execute(query, params)
        results = cursor.fetchall()
        
        # Organize data by year
        yearly_data = {}
        for row in results:
            year = str(int(row['year']))
            if year not in yearly_data:
                yearly_data[year] = {'year': year}
            
            # Clean category name for use as object key
            category_key = row['customer_category'].replace('/', '_').replace(' ', '_').replace('-', '_').replace('&', 'and')
            yearly_data[year][category_key] = float(row['revenue'])
        
        # Ensure all years have all categories (fill with 0 if missing)
        for year_data in yearly_data.values():
            for category in categories:
                category_key = category.replace('/', '_').replace(' ', '_').replace('-', '_').replace('&', 'and')
                if category_key not in year_data:
                    year_data[category_key] = 0
        
        category_growth_over_time = list(yearly_data.values())
        category_growth_over_time.sort(key=lambda x: int(x['year']))
        
        # Get category totals for KPIs
        totals_query = f"""
        SELECT 
            customer_category,
            SUM(revenue) as total_revenue
        FROM project_data 
        WHERE {where_clause} AND customer_category IS NOT NULL AND TRIM(customer_category) != ''
        GROUP BY customer_category
        ORDER BY total_revenue DESC
        """
        
        cursor.execute(totals_query, params)
        totals_results = cursor.fetchall()
        
        category_totals = [
            {
                'category': row['customer_category'],
                'revenue': float(row['total_revenue'])
            }
            for row in totals_results
        ]
        
        cursor.close()
        conn.close()
        
        return jsonify({
            'categoryGrowthOverTime': category_growth_over_time,
            'categories': categories,
            'categoryTotals': category_totals
        })
        
    except Exception as e:
        logger.error(f"Error in category growth: {e}")
        return jsonify({'error': str(e)}), 500

@app.route('/api/growth-drivers/new-projects', methods=['GET'])
def new_projects():
    """New projects contribution to growth"""
    try:
        customers, projects, resources, start_date, end_date = parse_filters(request)
        where_clause, params = build_where_clause(customers, projects, resources, start_date, end_date)
        
        conn = get_db_connection()
        cursor = conn.cursor(cursor_factory=RealDictCursor)
        
        # Get the latest year from data
        latest_year_query = f"""
        SELECT MAX(EXTRACT(YEAR FROM worked_date)) as latest_year
        FROM project_data 
        WHERE {where_clause}
        """
        
        cursor.execute(latest_year_query, params)
        latest_year_result = cursor.fetchone()
        latest_year = int(latest_year_result['latest_year']) if latest_year_result['latest_year'] else 2024
        
        # Find projects that started in the latest year
        query = f"""
        WITH project_start_dates AS (
            SELECT 
                project,
                customer_name,
                MIN(worked_date) as project_start_date,
                SUM(revenue) as total_revenue,
                SUM(billable_hours) as total_hours
            FROM project_data 
            WHERE {where_clause}
            GROUP BY project, customer_name
        ),
        new_projects_latest_year AS (
            SELECT 
                project,
                customer_name,
                project_start_date,
                total_revenue,
                total_hours
            FROM project_start_dates
            WHERE EXTRACT(YEAR FROM project_start_date) = %s
            ORDER BY total_revenue DESC
            LIMIT 10
        )
        SELECT 
            project,
            customer_name as customer,
            TO_CHAR(project_start_date, 'YYYY-MM-DD') as start_date,
            total_revenue as revenue,
            total_hours as hours
        FROM new_projects_latest_year
        """
        
        # Add latest_year to params
        all_params = params + [latest_year]
        cursor.execute(query, all_params)
        results = cursor.fetchall()
        
        top_new_projects = [
            {
                'project': row['project'][:40] + '...' if len(row['project']) > 40 else row['project'],
                'customer': row['customer'],
                'startDate': row['start_date'],
                'revenue': float(row['revenue']),
                'hours': float(row['hours'])
            }
            for row in results
        ]
        
        # Calculate total new projects revenue
        new_projects_revenue = sum(project['revenue'] for project in top_new_projects)
        
        cursor.close()
        conn.close()
        
        return jsonify({
            'topNewProjects': top_new_projects,
            'newProjectsRevenue': new_projects_revenue,
            'latestYear': latest_year
        })
        
    except Exception as e:
        logger.error(f"Error in new projects: {e}")
        return jsonify({'error': str(e)}), 500

@app.route('/api/growth-drivers/blended-rate', methods=['GET'])
def blended_rate():
    """Revenue per billable hour (blended rate) over time"""
    try:
        customers, projects, resources, start_date, end_date = parse_filters(request)
        where_clause, params = build_where_clause(customers, projects, resources, start_date, end_date)
        
        conn = get_db_connection()
        cursor = conn.cursor(cursor_factory=RealDictCursor)
        
        # Get blended rate over time (by year)
        query = f"""
        WITH yearly_rates AS (
            SELECT 
                EXTRACT(YEAR FROM worked_date) as year,
                SUM(revenue) as total_revenue,
                SUM(billable_hours) as total_hours,
                CASE 
                    WHEN SUM(billable_hours) > 0 
                    THEN SUM(revenue) / SUM(billable_hours)
                    ELSE 0 
                END as blended_rate
            FROM project_data 
            WHERE {where_clause}
            GROUP BY EXTRACT(YEAR FROM worked_date)
            ORDER BY year
        )
        SELECT 
            year::text as period,
            total_revenue,
            total_hours,
            blended_rate
        FROM yearly_rates
        """
        
        cursor.execute(query, params)
        results = cursor.fetchall()
        
        blended_rate_over_time = [
            {
                'period': row['period'],
                'totalRevenue': float(row['total_revenue']),
                'totalHours': float(row['total_hours']),
                'blendedRate': float(row['blended_rate'])
            }
            for row in results
        ]
        
        # Get current blended rate
        current_blended_rate = 0
        if blended_rate_over_time:
            current_blended_rate = blended_rate_over_time[-1]['blendedRate']
        
        cursor.close()
        conn.close()
        
        return jsonify({
            'blendedRateOverTime': blended_rate_over_time,
            'currentBlendedRate': current_blended_rate
        })
        
    except Exception as e:
        logger.error(f"Error in blended rate: {e}")
        return jsonify({'error': str(e)}), 500

@app.route('/api/growth-drivers/waterfall', methods=['GET'])
def waterfall():
    """Revenue bridge/waterfall analysis"""
    try:
        customers, projects, resources, start_date, end_date = parse_filters(request)
        where_clause, params = build_where_clause(customers, projects, resources, start_date, end_date)
        
        conn = get_db_connection()
        cursor = conn.cursor(cursor_factory=RealDictCursor)
        
        # Get latest and previous year data
        years_query = f"""
        SELECT 
            EXTRACT(YEAR FROM worked_date) as year,
            SUM(revenue) as total_revenue
        FROM project_data 
        WHERE {where_clause}
        GROUP BY EXTRACT(YEAR FROM worked_date)
        ORDER BY year DESC
        LIMIT 2
        """
        
        cursor.execute(years_query, params)
        years_results = cursor.fetchall()
        
        if len(years_results) < 2:
            # Not enough data for waterfall
            return jsonify({
                'waterfallData': [
                    {'name': 'No Data', 'value': 0, 'type': 'total', 'description': 'Insufficient data for waterfall analysis'}
                ]
            })
        
        current_year = int(years_results[0]['year'])
        previous_year = int(years_results[1]['year'])
        current_revenue = float(years_results[0]['total_revenue'])
        previous_revenue = float(years_results[1]['total_revenue'])
        
        # Get new projects revenue (projects that started in current year)
        # Simplified approach - get all project start dates first, then filter
        new_projects_query = f"""
        WITH project_starts AS (
            SELECT 
                project,
                MIN(worked_date) as first_date,
                SUM(revenue) as total_revenue
            FROM project_data 
            WHERE {where_clause}
            GROUP BY project
            HAVING MIN(worked_date) >= %s::date
        )
        SELECT 
            COALESCE(SUM(total_revenue), 0) as new_projects_revenue
        FROM project_starts
        WHERE EXTRACT(YEAR FROM first_date) = %s
        """
        
        # Create year start date for filtering
        current_year_start = f"{current_year}-01-01"
        new_projects_params = params + [current_year_start, current_year]
        
        cursor.execute(new_projects_query, new_projects_params)
        new_projects_result = cursor.fetchone()
        new_projects_revenue = float(new_projects_result['new_projects_revenue']) if new_projects_result['new_projects_revenue'] else 0
        
        # Calculate existing projects change
        existing_projects_change = current_revenue - previous_revenue - new_projects_revenue
        
        # Build waterfall data
        waterfall_data = [
            {
                'name': f'{previous_year} Revenue',
                'value': previous_revenue,
                'type': 'total',
                'description': f'Starting revenue for {previous_year}'
            },
            {
                'name': 'New Projects',
                'value': new_projects_revenue,
                'type': 'change',
                'description': f'Revenue from projects started in {current_year}'
            },
            {
                'name': 'Existing Projects',
                'value': existing_projects_change,
                'type': 'change',
                'description': f'Change in revenue from existing projects'
            },
            {
                'name': f'{current_year} Revenue',
                'value': current_revenue,
                'type': 'total',
                'description': f'Final revenue for {current_year}'
            }
        ]
        
        cursor.close()
        conn.close()
        
        return jsonify({'waterfallData': waterfall_data})
        
    except Exception as e:
        logger.error(f"Error in waterfall analysis: {e}")
        return jsonify({'error': str(e)}), 500

@app.route('/api/growth-drivers/customers-in-category', methods=['GET'])
def growth_customers_in_category():
    """Get top customers within a specific category for growth analysis"""
    try:
        customers, projects, resources, start_date, end_date = parse_filters(request)
        where_clause, params = build_where_clause(customers, projects, resources, start_date, end_date)
        
        # Get the category parameter
        category = request.args.get('category', '').strip()
        if not category:
            return jsonify({'error': 'Category parameter is required'}), 400
        
        conn = get_db_connection()
        cursor = conn.cursor(cursor_factory=RealDictCursor)
        
        # Get top customers in the specified category
        query = f"""
        SELECT 
            customer_name,
            SUM(revenue) as total_revenue,
            SUM(billable_hours) as total_hours,
            COUNT(DISTINCT project) as project_count
        FROM project_data 
        WHERE {where_clause} AND customer_category = %s
        GROUP BY customer_name
        ORDER BY total_revenue DESC
        LIMIT 5
        """
        
        # Add category parameter to params
        all_params = params + [category]
        cursor.execute(query, all_params)
        results = cursor.fetchall()
        
        # Format for chart
        customer_data = [
            {
                'customer': row['customer_name'],
                'revenue': float(row['total_revenue']),
                'hours': float(row['total_hours']),
                'projects': row['project_count']
            }
            for row in results
        ]
        
        cursor.close()
        conn.close()
        
        return jsonify({
            'customerData': customer_data,
            'category': category
        })
        
    except Exception as e:
        logger.error(f"Error in growth customers in category: {e}")
        return jsonify({'error': str(e)}), 500

# ... (rest of the code remains unchanged)

@app.route('/api/growth-drivers/yearly-waterfall', methods=['GET'])
def yearly_waterfall():
    """Detailed waterfall analysis for a specific year"""
    try:
        customers, projects, resources, start_date, end_date = parse_filters(request)
        where_clause, params = build_where_clause(customers, projects, resources, start_date, end_date)
        
        # Get the year parameter
        year = request.args.get('year', '').strip()
        if not year:
            return jsonify({'error': 'Year parameter is required'}), 400
        
        year = int(year)
        previous_year = year - 1
        
        conn = get_db_connection()
        cursor = conn.cursor(cursor_factory=RealDictCursor)
        
        # Get detailed breakdown by customer category for the year
        # Simplified approach to avoid parameter type conflicts
        query = f"""
        WITH filtered_data AS (
            SELECT 
                customer_category,
                EXTRACT(YEAR FROM worked_date) as data_year,
                revenue
            FROM project_data 
            WHERE {where_clause}
            AND EXTRACT(YEAR FROM worked_date) IN (%s, %s)
            AND customer_category IS NOT NULL 
            AND TRIM(customer_category) != ''
        ),
        year_comparison AS (
            SELECT 
                customer_category,
                SUM(CASE WHEN data_year = %s THEN revenue ELSE 0 END) as current_year_revenue,
                SUM(CASE WHEN data_year = %s THEN revenue ELSE 0 END) as previous_year_revenue
            FROM filtered_data
            GROUP BY customer_category
        ),
        category_changes AS (
            SELECT 
                customer_category,
                current_year_revenue,
                previous_year_revenue,
                (current_year_revenue - previous_year_revenue) as revenue_change
            FROM year_comparison
            WHERE current_year_revenue > 0 OR previous_year_revenue > 0
        )
        SELECT 
            customer_category as name,
            revenue_change as value,
            'change' as type,
            CONCAT('Revenue change in ', customer_category, ' from ', %s::text, ' to ', %s::text) as description
        FROM category_changes
        WHERE ABS(revenue_change) > 1000  -- Only show significant changes
        ORDER BY ABS(revenue_change) DESC
        LIMIT 8
        """
        
        # Build parameters: filter params + year constraints + aggregation years + description years
        all_params = params + [year, previous_year, year, previous_year, previous_year, year]
        cursor.execute(query, all_params)
        results = cursor.fetchall()
        
        waterfall_data = [
            {
                'name': row['name'][:20] + '...' if len(row['name']) > 20 else row['name'],
                'value': float(row['value']),
                'type': row['type'],
                'description': row['description']
            }
            for row in results
        ]
        
        # Add start and end totals
        totals_query = f"""
        WITH yearly_totals AS (
            SELECT 
                EXTRACT(YEAR FROM worked_date) as data_year,
                revenue
            FROM project_data 
            WHERE {where_clause}
            AND EXTRACT(YEAR FROM worked_date) IN (%s, %s)
        )
        SELECT 
            SUM(CASE WHEN data_year = %s THEN revenue ELSE 0 END) as current_total,
            SUM(CASE WHEN data_year = %s THEN revenue ELSE 0 END) as previous_total
        FROM yearly_totals
        """
        
        totals_params = params + [year, previous_year, year, previous_year]
        cursor.execute(totals_query, totals_params)
        totals_result = cursor.fetchone()
        
        current_total = float(totals_result['current_total']) if totals_result['current_total'] else 0
        previous_total = float(totals_result['previous_total']) if totals_result['previous_total'] else 0
        
        # Insert start and end totals
        final_waterfall_data = [
            {
                'name': f'{previous_year} Total',
                'value': previous_total,
                'type': 'total',
                'description': f'Total revenue for {previous_year}'
            }
        ] + waterfall_data + [
            {
                'name': f'{year} Total',
                'value': current_total,
                'type': 'total',
                'description': f'Total revenue for {year}'
            }
        ]
        
        cursor.close()
        conn.close()
        
        return jsonify({
            'waterfallData': final_waterfall_data,
            'year': year
        })
        
    except Exception as e:
        logger.error(f"Error in yearly waterfall: {e}")
        return jsonify({'error': str(e)}), 500
        
# ======= FORECASTING ENDPOINTS =======

@app.route('/api/forecasting', methods=['GET'])
def forecasting_analysis():
    """Main forecasting analysis with Holt-Winters model"""
    try:
        customers, projects, resources, start_date, end_date = parse_filters(request)
        where_clause, params = build_where_clause(customers, projects, resources, start_date, end_date)
        
        conn = get_db_connection()
        cursor = conn.cursor(cursor_factory=RealDictCursor)
        
        # Get all historical data for model training (unfiltered)
        all_data_query = """
        SELECT 
            TO_CHAR(worked_date, 'YYYY-MM-01') as month_start,
            SUM(revenue) as monthly_revenue
        FROM project_data 
        GROUP BY TO_CHAR(worked_date, 'YYYY-MM-01')
        ORDER BY month_start
        """
        
        cursor.execute(all_data_query)
        all_data_results = cursor.fetchall()
        
        # Get filtered data for actual revenue line
        filtered_query = f"""
        SELECT 
            TO_CHAR(worked_date, 'YYYY-MM-01') as month_start,
            SUM(revenue) as monthly_revenue
        FROM project_data 
        WHERE {where_clause}
        GROUP BY TO_CHAR(worked_date, 'YYYY-MM-01')
        ORDER BY month_start
        """
        
        cursor.execute(filtered_query, params)
        filtered_results = cursor.fetchall()
        
        # Prepare data for statistical analysis
        

        # Convert to pandas DataFrame for easier manipulation
        if all_data_results:
            all_df = pd.DataFrame(all_data_results)
            all_df['month_start'] = pd.to_datetime(all_df['month_start'])
            all_df['monthly_revenue'] = pd.to_numeric(all_df['monthly_revenue'], errors='coerce').fillna(0)
            all_df = all_df.set_index('month_start').asfreq('MS', fill_value=0)
            all_ts = all_df['monthly_revenue']

            # Ensure we have enough data for the model
            if len(all_ts) >= 24: # Require at least 2 seasonal cycles
                # Holt-Winters model fitting
                model = ExponentialSmoothing(
                    all_ts,
                    seasonal_periods=12,
                    trend='add',
                    seasonal='add',
                    initialization_method="estimated"
                ).fit()

                # Fitted values
                fitted_values = model.fittedvalues

                # Generate 12-month forecast
                forecast_values = model.forecast(12)
                
                # Create forecast index
                last_date = all_ts.index[-1]
                forecast_index = pd.date_range(start=last_date + pd.DateOffset(months=1), periods=12, freq='MS')

                # Calculate model accuracy
                mape = mean_absolute_percentage_error(all_ts, fitted_values) * 100
                rmse = np.sqrt(mean_squared_error(all_ts, fitted_values))

                # Prepare historical data with fitted values
                historical_data = []
                for date, actual, fitted in zip(all_ts.index, all_ts.values, fitted_values.values):
                    historical_data.append({
                        'month': date.strftime('%Y-%m-%d'),
                        'monthLabel': date.strftime('%b %Y'),
                        'actual': float(actual),
                        'fitted': float(fitted),
                        'type': 'historical'
                    })
                
                # Add forecast data
                forecast_data = []
                for date, forecast_val in zip(forecast_index, forecast_values):
                    # Confidence intervals are not directly available without more complex methods
                    # Using a simple percentage for visualization
                    confidence_factor = 0.15 
                    lower_bound = forecast_val * (1 - confidence_factor)
                    upper_bound = forecast_val * (1 + confidence_factor)
                    
                    forecast_data.append({
                        'month': date.strftime('%Y-%m-%d'),
                        'monthLabel': date.strftime('%b %Y'),
                        'forecast': float(forecast_val),
                        'lowerBound': float(lower_bound),
                        'upperBound': float(upper_bound),
                        'type': 'forecast'
                    })

                # Calculate detrended series (residuals)
                residuals = model.resid
                detrended_data = []
                for date, residual in zip(residuals.index, residuals.values):
                    detrended_data.append({
                        'month': date.strftime('%Y-%m-%d'),
                        'monthLabel': date.strftime('%b %Y'),
                        'residual': float(residual)
                    })

                # Get filtered actual data for comparison
                filtered_df = pd.DataFrame(filtered_results) if filtered_results else pd.DataFrame()
                filtered_actual_data = []
                if not filtered_df.empty:
                    filtered_df['month_start'] = pd.to_datetime(filtered_df['month_start'])
                    filtered_df = filtered_df.set_index('month_start')
                    
                    # Align with the main dataframe index for proper overlay
                    aligned_filtered = filtered_df.reindex(all_df.index).fillna(0)
                    
                    for date, revenue in zip(aligned_filtered.index, aligned_filtered['monthly_revenue']):
                        filtered_actual_data.append({
                            'month': date.strftime('%Y-%m-%d'),
                            'monthLabel': date.strftime('%b %Y'),
                            'actual': float(revenue)
                        })

                # Calculate KPIs
                total_forecasted_revenue = forecast_values.sum()
                last_12_months_actual = all_ts[-12:].sum() if len(all_ts) >= 12 else all_ts.sum()
                last_12_months_fitted = fitted_values[-12:].sum() if len(fitted_values) >= 12 else fitted_values.sum()

                result = {
                    'historicalData': historical_data,
                    'forecastData': forecast_data,
                    'detrendedData': detrended_data[-36:],  # Last 3 years
                    'filteredActualData': filtered_actual_data,
                    'kpis': {
                        'forecastedRevenue12Months': total_forecasted_revenue,
                        'last12MonthsActual': last_12_months_actual,
                        'last12MonthsFitted': last_12_months_fitted,
                        'modelAccuracyMAPE': mape,
                        'modelAccuracyRMSE': rmse
                    }
                }
            else:
                # Insufficient data fallback
                result = {
                    'historicalData': [], 'forecastData': [], 'detrendedData': [],
                    'filteredActualData': [],
                    'kpis': {'forecastedRevenue12Months': 0, 'last12MonthsActual': 0, 'last12MonthsFitted': 0, 'modelAccuracyMAPE': 0, 'modelAccuracyRMSE': 0}
                }
        else:
            # No data fallback
            result = {
                'historicalData': [], 'forecastData': [], 'detrendedData': [],
                'filteredActualData': [],
                'kpis': {'forecastedRevenue12Months': 0, 'last12MonthsActual': 0, 'last12MonthsFitted': 0, 'modelAccuracyMAPE': 0, 'modelAccuracyRMSE': 0}
            }

        cursor.close()
        conn.close()
        
        return jsonify(result)
        
    except Exception as e:
        logger.error(f"Error in forecasting analysis: {e}")
        return jsonify({'error': str(e)}), 500

@app.route('/api/forecasting/autocorrelation', methods=['GET'])
def autocorrelation_analysis():
    """ACF and PACF analysis for time series"""
    try:
        conn = get_db_connection()
        cursor = conn.cursor(cursor_factory=RealDictCursor)
        
        # Get all historical data (unfiltered for proper ACF/PACF analysis)
        query = """
        SELECT 
            TO_CHAR(worked_date, 'YYYY-MM-01') as month_start,
            SUM(revenue) as monthly_revenue
        FROM project_data 
        GROUP BY TO_CHAR(worked_date, 'YYYY-MM-01')
        ORDER BY month_start
        """
        
        cursor.execute(query)
        results = cursor.fetchall()
        
        if results and len(results) >= 24:  # Need at least 2 years for meaningful analysis

            # Convert to pandas DataFrame
            df = pd.DataFrame(results)
            df['month_start'] = pd.to_datetime(df['month_start'])
            df = df.set_index('month_start').asfreq('MS', fill_value=0)
            ts = df['monthly_revenue']
            
            # Calculate ACF and PACF using statsmodels
            max_lags = min(24, len(ts) // 2 - 1)
            acf_values, acf_confint = acf(ts, nlags=max_lags, alpha=0.05)
            pacf_values, pacf_confint = pacf(ts, nlags=max_lags, alpha=0.05)
            
            # Prepare data for charts
            acf_data = []
            pacf_data = []
            
            for lag in range(len(acf_values)):
                acf_data.append({
                    'lag': lag,
                    'acf': float(acf_values[lag]),
                    'upperBound': float(acf_confint[lag, 1] - acf_values[lag]), # Symmetric CI
                    'lowerBound': float(acf_confint[lag, 0] - acf_values[lag])
                })
            
            for lag in range(len(pacf_values)):
                pacf_data.append({
                    'lag': lag,
                    'pacf': float(pacf_values[lag]),
                    'upperBound': float(pacf_confint[lag, 1] - pacf_values[lag]),
                    'lowerBound': float(pacf_confint[lag, 0] - pacf_values[lag])
                })
            
            result = {
                'acfData': acf_data,
                'pacfData': pacf_data,
                'significantLags': {
                    'acf': [i for i, val in enumerate(acf_values) if i > 0 and (val > acf_confint[i, 1] or val < acf_confint[i, 0])],
                    'pacf': [i for i, val in enumerate(pacf_values) if i > 0 and (val > pacf_confint[i, 1] or val < pacf_confint[i, 0])]
                }
            }
        else:
            # Insufficient data
            result = {
                'acfData': [],
                'pacfData': [],
                'significantLags': {'acf': [], 'pacf': []}
            }
        
        cursor.close()
        conn.close()
        
        return jsonify(result)
        
    except Exception as e:
        logger.error(f"Error in autocorrelation analysis: {e}")
        return jsonify({'error': str(e)}), 500

@app.route('/api/forecasting/model-diagnostics', methods=['GET'])
def model_diagnostics():
    """Additional model diagnostics and validation metrics"""
    try:
        conn = get_db_connection()
        cursor = conn.cursor(cursor_factory=RealDictCursor)
        
        # Get all historical data for validation
        query = """
        SELECT 
            TO_CHAR(worked_date, 'YYYY-MM-01') as month_start,
            SUM(revenue) as monthly_revenue
        FROM project_data 
        GROUP BY TO_CHAR(worked_date, 'YYYY-MM-01')
        ORDER BY month_start
        """
        
        cursor.execute(query)
        results = cursor.fetchall()
        
        if results and len(results) >= 12:

            df = pd.DataFrame(results)
            df['month_start'] = pd.to_datetime(df['month_start'])
            df = df.set_index('month_start').asfreq('MS', fill_value=0)
            actual_values = df['monthly_revenue']
            
            # Calculate various validation metrics
            n = len(actual_values)
            
            # Train/test split for validation (80/20)
            split_point = int(0.8 * n)
            train_data = actual_values[:split_point]
            test_data = actual_values[split_point:]
            
            # Simple moving average baseline for comparison
            window_size = 12
            if len(train_data) >= window_size:
                moving_avg_forecast = train_data.rolling(window=window_size).mean().iloc[-1] # last value
                test_forecast = pd.Series([moving_avg_forecast] * len(test_data), index=test_data.index)

                mae = mean_absolute_error(test_data, test_forecast)
                mse = mean_squared_error(test_data, test_forecast)
                rmse = np.sqrt(mse)
                mape = mean_absolute_percentage_error(test_data, test_forecast) * 100
                r_squared = r2_score(test_data, test_forecast)
            else:
                mae = mse = rmse = mape = r_squared = 0
            
            # Seasonality and Trend strength from decomposition
            if len(actual_values) >= 24:
                decomposition = seasonal_decompose(actual_values, model='additive', period=12)
                
                # Strength of seasonality and trend
                trend_strength = max(0, 1 - np.var(decomposition.resid) / np.var(decomposition.trend + decomposition.resid))
                seasonal_strength = max(0, 1 - np.var(decomposition.resid) / np.var(decomposition.seasonal + decomposition.resid))
            else:
                trend_strength = 0
                seasonal_strength = 0

            result = {
                'validationMetrics': {
                    'mae': float(mae),
                    'mse': float(mse),
                    'rmse': float(rmse),
                    'mape': float(mape),
                    'rSquared': float(r_squared)
                },
                'timeSeriesProperties': {
                    'seasonalityStrength': float(seasonal_strength),
                    'trendStrength': float(trend_strength),
                    'dataPoints': n,
                    'trainTestSplit': f"{split_point}/{n-split_point}"
                },
                'validationPeriod': {
                    'trainStart': df.index[0].strftime('%Y-%m-%d'),
                    'trainEnd': df.index[split_point-1].strftime('%Y-%m-%d'),
                    'testStart': df.index[split_point].strftime('%Y-%m-%d') if split_point < len(df.index) else None,
                    'testEnd': df.index[-1].strftime('%Y-%m-%d')
                }
            }
        else:
            result = {
                'validationMetrics': {
                    'mae': 0, 'mse': 0, 'rmse': 0, 'mape': 0, 'rSquared': 0
                },
                'timeSeriesProperties': {
                    'seasonalityStrength': 0, 'trendStrength': 0, 'dataPoints': 0, 'trainTestSplit': '0/0'
                },
                'validationPeriod': {
                    'trainStart': None, 'trainEnd': None, 'testStart': None, 'testEnd': None
                }
            }
        
        cursor.close()
        conn.close()
        
        return jsonify(result)
        
    except Exception as e:
        logger.error(f"Error in model diagnostics: {e}")
        return jsonify({'error': str(e)}), 500
    
# ======= PROJECT ANALYTICS ENDPOINTS =======

@app.route('/api/project-analytics', methods=['GET'])
def project_analytics():
    """Main project analytics endpoint"""
    try:
        customers, projects, resources, start_date, end_date = parse_filters(request)
        where_clause, params = build_where_clause(customers, projects, resources, start_date, end_date)
        
        conn = get_db_connection()
        cursor = conn.cursor(cursor_factory=RealDictCursor)
        
        # Main project analytics query
        query = f"""
        WITH project_data AS (
            SELECT 
                project,
                customer_name,
                customer_category,
                SUM(revenue) as total_revenue,
                SUM(billable_hours) as total_hours,
                COUNT(DISTINCT resource_name) as resource_count,
                MIN(worked_date) as start_date,
                MAX(worked_date) as end_date,
                COUNT(DISTINCT worked_date) as work_days
            FROM project_data 
            WHERE {where_clause}
            GROUP BY project, customer_name, customer_category
        ),
        project_metrics AS (
            SELECT 
                project,
                customer_name,
                customer_category,
                total_revenue,
                total_hours,
                resource_count,
                start_date,
                end_date,
                work_days,
                -- Calculate project duration in days
                (end_date - start_date + 1) as duration_days,
                -- Calculate revenue per hour
                CASE 
                    WHEN total_hours > 0 
                    THEN total_revenue / total_hours 
                    ELSE 0 
                END as revenue_per_hour
            FROM project_data
        )
        SELECT 
            project,
            customer_name,
            customer_category,
            total_revenue,
            total_hours,
            resource_count,
            start_date::text as start_date,
            end_date::text as end_date,
            work_days,
            duration_days,
            revenue_per_hour
        FROM project_metrics
        ORDER BY total_revenue DESC
        """
        
        cursor.execute(query, params)
        results = cursor.fetchall()
        
        # Calculate KPIs
        if results:
            total_projects = len(results)
            total_revenue = sum(float(row['total_revenue']) for row in results)
            avg_duration = sum(row['duration_days'] for row in results) / total_projects
            top_10_projects = results[:10]
        else:
            total_projects = 0
            total_revenue = 0
            avg_duration = 0
            top_10_projects = []
        
        # Process results for frontend
        project_analytics_data = [
            {
                'project': row['project'],
                'customerName': row['customer_name'],
                'customerCategory': row['customer_category'],
                'totalRevenue': float(row['total_revenue']),
                'totalHours': float(row['total_hours']),
                'resourceCount': row['resource_count'],
                'startDate': row['start_date'],
                'endDate': row['end_date'],
                'workDays': row['work_days'],
                'durationDays': row['duration_days'],
                'revenuePerHour': float(row['revenue_per_hour'])
            }
            for row in results
        ]
        
        cursor.close()
        conn.close()
        
        return jsonify({
            'projectData': project_analytics_data,
            'kpis': {
                'totalProjects': total_projects,
                'totalRevenue': total_revenue,
                'avgDuration': avg_duration,
                'top10Projects': [
                    {
                        'project': row['project'][:30] + '...' if len(row['project']) > 30 else row['project'],
                        'fullProject': row['project'],
                        'revenue': float(row['total_revenue'])
                    }
                    for row in top_10_projects
                ]
            }
        })
        
    except Exception as e:
        logger.error(f"Error in project analytics: {e}")
        return jsonify({'error': str(e)}), 500

@app.route('/api/project-analytics/revenue-by-project', methods=['GET'])
def revenue_by_project():
    """Top 5 projects by revenue for bar chart visualization"""
    try:
        customers, projects, resources, start_date, end_date = parse_filters(request)
        where_clause, params = build_where_clause(customers, projects, resources, start_date, end_date)
        
        conn = get_db_connection()
        cursor = conn.cursor(cursor_factory=RealDictCursor)
        
        query = f"""
        SELECT 
            project,
            SUM(revenue) as total_revenue
        FROM project_data 
        WHERE {where_clause} AND project IS NOT NULL
        GROUP BY project
        ORDER BY total_revenue DESC
        LIMIT 5
        """
        
        cursor.execute(query, params)
        results = cursor.fetchall()
        
        bar_chart_data = [
            {
                'name': row['project'][:25] + '...' if len(row['project']) > 25 else row['project'],
                'fullName': row['project'],
                'value': float(row['total_revenue'])
            }
            for row in results
        ]
        
        cursor.close()
        conn.close()
        
        return jsonify({'barChartData': bar_chart_data})
        
    except Exception as e:
        logger.error(f"Error in revenue by project: {e}")
        return jsonify({'error': str(e)}), 500

@app.route('/api/project-analytics/revenue-by-customer-for-project', methods=['GET'])
def revenue_by_customer_for_project():
    """Get revenue by customer for a specific project (for drill-down treemap)"""
    try:
        customers, projects, resources, start_date, end_date = parse_filters(request)
        where_clause, params = build_where_clause(customers, projects, resources, start_date, end_date)
        
        project_name = request.args.get('project', '').strip()
        if not project_name:
            return jsonify({'error': 'Project parameter is required'}), 400

        conn = get_db_connection()
        cursor = conn.cursor(cursor_factory=RealDictCursor)

        query = f"""
        SELECT 
            customer_name,
            customer_category,
            SUM(revenue) as total_revenue
        FROM project_data 
        WHERE {where_clause} AND project = %s
        GROUP BY customer_name, customer_category
        HAVING SUM(revenue) > 0
        ORDER BY total_revenue DESC
        """
        all_params = params + [project_name]
        cursor.execute(query, all_params)
        results = cursor.fetchall()
        
        treemap_data = [
            {
                'name': row['customer_name'],
                'value': float(row['total_revenue']),
                'category': row['customer_category']
            }
            for row in results
        ]

        cursor.close()
        conn.close()
        
        return jsonify({
            'treemapData': treemap_data,
            'project': project_name
        })
        
    except Exception as e:
        logger.error(f"Error in revenue by customer for project: {e}")
        return jsonify({'error': str(e)}), 500

@app.route('/api/project-analytics/duration-distribution', methods=['GET'])
def duration_distribution():
    """Project duration distribution for histogram"""
    try:
        customers, projects, resources, start_date, end_date = parse_filters(request)
        where_clause, params = build_where_clause(customers, projects, resources, start_date, end_date)
        
        conn = get_db_connection()
        cursor = conn.cursor(cursor_factory=RealDictCursor)
        
        query = f"""
        WITH project_durations AS (
            SELECT 
                project,
                (MAX(worked_date) - MIN(worked_date) + 1) as duration_days
            FROM project_data 
            WHERE {where_clause}
            GROUP BY project
        ),
        duration_buckets AS (
            SELECT 
                CASE 
                    WHEN duration_days <= 30 THEN '0-30 days'
                    WHEN duration_days <= 60 THEN '31-60 days'
                    WHEN duration_days <= 90 THEN '61-90 days'
                    WHEN duration_days <= 120 THEN '91-120 days'
                    WHEN duration_days <= 180 THEN '121-180 days'
                    WHEN duration_days <= 365 THEN '181-365 days'
                    ELSE '365+ days'
                END as duration_bucket,
                duration_days
            FROM project_durations
        )
        SELECT 
            duration_bucket,
            COUNT(*) as project_count,
            AVG(duration_days) as avg_duration
        FROM duration_buckets
        GROUP BY duration_bucket
        ORDER BY 
            CASE duration_bucket
                WHEN '0-30 days' THEN 1
                WHEN '31-60 days' THEN 2
                WHEN '61-90 days' THEN 3
                WHEN '91-120 days' THEN 4
                WHEN '121-180 days' THEN 5
                WHEN '181-365 days' THEN 6
                WHEN '365+ days' THEN 7
            END
        """
        
        cursor.execute(query, params)
        results = cursor.fetchall()
        
        histogram_data = [
            {
                'bucket': row['duration_bucket'],
                'count': row['project_count'],
                'avgDuration': float(row['avg_duration'])
            }
            for row in results
        ]
        
        cursor.close()
        conn.close()
        
        return jsonify({'histogramData': histogram_data})
        
    except Exception as e:
        logger.error(f"Error in duration distribution: {e}")
        return jsonify({'error': str(e)}), 500

@app.route('/api/project-analytics/top-projects', methods=['GET'])
def projects_per_category_analytics():
    """Number of projects per customer category"""
    try:
        customers, projects, resources, start_date, end_date = parse_filters(request)
        where_clause, params = build_where_clause(customers, projects, resources, start_date, end_date)
        
        conn = get_db_connection()
        cursor = conn.cursor(cursor_factory=RealDictCursor)
        
        query = f"""
        SELECT 
            customer_category,
            COUNT(DISTINCT project) as project_count
        FROM project_data
        WHERE {where_clause} AND customer_category IS NOT NULL AND TRIM(customer_category) != ''
        GROUP BY customer_category
        ORDER BY project_count DESC
        """
        cursor.execute(query, params)
        results = cursor.fetchall()

        category_data = [
            {
                'category': row['customer_category'],
                'count': int(row['project_count'])
            } for row in results
        ]

        cursor.close()
        conn.close()

        return jsonify({'categoryData': category_data})
        
    except Exception as e:
        logger.error(f"Error in top projects analytics: {e}")
        return jsonify({'error': str(e)}), 500

@app.route('/api/project-analytics/top-projects-for-category', methods=['GET'])
def top_projects_for_category():
    """Get top 5 projects by revenue for a specific category."""
    try:
        customers, projects, resources, start_date, end_date = parse_filters(request)
        where_clause, params = build_where_clause(customers, projects, resources, start_date, end_date)
        
        category = request.args.get('category', '').strip()
        if not category:
            return jsonify({'error': 'Category parameter is required'}), 400

        conn = get_db_connection()
        cursor = conn.cursor(cursor_factory=RealDictCursor)

        query = f"""
        SELECT 
            project,
            customer_name,
            SUM(revenue) as total_revenue,
            SUM(billable_hours) as total_hours
        FROM project_data
        WHERE {where_clause} AND customer_category = %s
        GROUP BY project, customer_name
        ORDER BY total_revenue DESC
        LIMIT 5
        """
        all_params = params + [category]
        cursor.execute(query, all_params)
        results = cursor.fetchall()

        project_data = [
            {
                'project': row['project'][:30] + '...' if len(row['project']) > 30 else row['project'],
                'fullProject': row['project'],
                'customer': row['customer_name'],
                'revenue': float(row['total_revenue']),
                'hours': float(row['total_hours'])
            }
            for row in results
        ]

        cursor.close()
        conn.close()

        return jsonify({
            'projectData': project_data,
            'category': category
        })

    except Exception as e:
        logger.error(f"Error in top projects for category: {e}")
        return jsonify({'error': str(e)}), 500

@app.route('/api/project-analytics/project-customer-matrix', methods=['GET'])
def project_customer_matrix():
    """Revenue matrix by project and customer category for bubble chart"""
    try:
        customers, projects, resources, start_date, end_date = parse_filters(request)
        where_clause, params = build_where_clause(customers, projects, resources, start_date, end_date)
        
        conn = get_db_connection()
        cursor = conn.cursor(cursor_factory=RealDictCursor)
        
        # Get top projects and customer categories to limit bubble chart size
        query = f"""
        WITH top_projects AS (
            SELECT project, SUM(revenue) as total_revenue
            FROM project_data 
            WHERE {where_clause} AND project IS NOT NULL
            GROUP BY project
            ORDER BY total_revenue DESC
            LIMIT 15
        ),
        top_categories AS (
            SELECT customer_category, SUM(revenue) as total_revenue
            FROM project_data 
            WHERE {where_clause} AND customer_category IS NOT NULL AND TRIM(customer_category) != ''
            GROUP BY customer_category
            ORDER BY total_revenue DESC
            LIMIT 10
        ),
        matrix_data AS (
            SELECT 
                pd.project,
                pd.customer_category,
                SUM(pd.revenue) as revenue
            FROM project_data pd
            INNER JOIN top_projects tp ON pd.project = tp.project
            INNER JOIN top_categories tc ON pd.customer_category = tc.customer_category
            WHERE {where_clause}
            GROUP BY pd.project, pd.customer_category
        )
        SELECT 
            project,
            customer_category,
            revenue
        FROM matrix_data
        WHERE revenue > 0
        ORDER BY revenue DESC
        """
        
        # We use where_clause three times
        all_params = params + params + params
        cursor.execute(query, all_params)
        results = cursor.fetchall()
        
        # Organize data for bubble chart
        matrix_data = []
        for row in results:
            matrix_data.append({
                'project': row['project'][:25] + '...' if len(row['project']) > 25 else row['project'],
                'fullProject': row['project'],
                'category': row['customer_category'],
                'revenue': float(row['revenue'])
            })
        
        cursor.close()
        conn.close()
        
        return jsonify({'matrixData': matrix_data})
        
    except Exception as e:
        logger.error(f"Error in project customer matrix: {e}")
        return jsonify({'error': str(e)}), 500

@app.route('/api/project-analytics/project-value-analysis', methods=['GET'])
def project_value_analysis():
    """Project value analysis for scatter plot visualization"""
    try:
        customers, projects, resources, start_date, end_date = parse_filters(request)
        where_clause, params = build_where_clause(customers, projects, resources, start_date, end_date)
        
        duration_bucket = request.args.get('bucket', '').strip()
        
        conn = get_db_connection()
        cursor = conn.cursor(cursor_factory=RealDictCursor)
        
        duration_condition = ""
        if duration_bucket:
            bucket_conditions = {
                '0-30 days': '(MAX(worked_date) - MIN(worked_date) + 1) <= 30',
                '31-60 days': '(MAX(worked_date) - MIN(worked_date) + 1) > 30 AND (MAX(worked_date) - MIN(worked_date) + 1) <= 60',
                '61-90 days': '(MAX(worked_date) - MIN(worked_date) + 1) > 60 AND (MAX(worked_date) - MIN(worked_date) + 1) <= 90',
                '91-120 days': '(MAX(worked_date) - MIN(worked_date) + 1) > 90 AND (MAX(worked_date) - MIN(worked_date) + 1) <= 120',
                '121-180 days': '(MAX(worked_date) - MIN(worked_date) + 1) > 120 AND (MAX(worked_date) - MIN(worked_date) + 1) <= 180',
                '181-365 days': '(MAX(worked_date) - MIN(worked_date) + 1) > 180 AND (MAX(worked_date) - MIN(worked_date) + 1) <= 365',
                '365+ days': '(MAX(worked_date) - MIN(worked_date) + 1) > 365'
            }
            if duration_bucket in bucket_conditions:
                duration_condition = f"HAVING {bucket_conditions[duration_bucket]}"

        query = f"""
        WITH project_summary AS (
            SELECT 
                project,
                customer_category,
                SUM(revenue) as total_revenue,
                SUM(billable_hours) as total_hours,
                (MAX(worked_date) - MIN(worked_date) + 1) as duration_days
            FROM project_data
            WHERE {where_clause} AND project IS NOT NULL AND customer_category IS NOT NULL AND TRIM(customer_category) != ''
            GROUP BY project, customer_category
            {duration_condition}
        )
        SELECT 
            project,
            customer_category,
            total_revenue,
            duration_days,
            CASE 
                WHEN total_hours > 0 
                THEN total_revenue / total_hours 
                ELSE 0 
            END as avg_hourly_rate
        FROM project_summary
        WHERE total_revenue > 0 AND total_hours > 0 AND duration_days > 0
        ORDER BY total_revenue DESC
        """
        
        cursor.execute(query, params)
        results = cursor.fetchall()
        
        scatter_data = [
            {
                'project': row['project'],
                'category': row['customer_category'],
                'revenue': float(row['total_revenue']),
                'duration': int(row['duration_days']),
                'rate': float(row['avg_hourly_rate'])
            }
            for row in results
        ]
        
        cursor.close()
        conn.close()
        
        return jsonify({'projectValueData': scatter_data})
        
    except Exception as e:
        logger.error(f"Error in project value analysis: {e}")
        return jsonify({'error': str(e)}), 500

@app.route('/api/project-analytics/project-efficiency-quadrant', methods=['GET'])
def project_efficiency_quadrant():
    """Project efficiency quadrant analysis"""
    try:
        customers, projects, resources, start_date, end_date = parse_filters(request)
        where_clause, params = build_where_clause(customers, projects, resources, start_date, end_date)
        
        conn = get_db_connection()
        cursor = conn.cursor(cursor_factory=RealDictCursor)
        
        query = f"""
        WITH project_summary AS (
            SELECT 
                project,
                customer_category,
                SUM(revenue) as total_revenue,
                SUM(billable_hours) as total_hours
            FROM project_data
            WHERE {where_clause} AND project IS NOT NULL AND customer_category IS NOT NULL AND TRIM(customer_category) != ''
            GROUP BY project, customer_category
        )
        SELECT 
            project,
            customer_category,
            total_revenue,
            total_hours,
            CASE 
                WHEN total_hours > 0 
                THEN total_revenue / total_hours 
                ELSE 0 
            END as avg_hourly_rate
        FROM project_summary
        WHERE total_revenue > 0 AND total_hours > 0
        """
        
        cursor.execute(query, params)
        results = cursor.fetchall()
        
        quadrant_data = [
            {
                'project': row['project'],
                'category': row['customer_category'],
                'revenue': float(row['total_revenue']),
                'hours': float(row['total_hours']),
                'rate': float(row['avg_hourly_rate'])
            }
            for row in results
        ]
        
        cursor.close()
        conn.close()
        
        return jsonify({'quadrantData': quadrant_data})
        
    except Exception as e:
        logger.error(f"Error in project efficiency quadrant analysis: {e}")
        return jsonify({'error': str(e)}), 500

@app.route('/api/project-analytics/projects-by-duration', methods=['GET'])
def projects_by_duration():
    """Get top 5 projects for a specific duration bucket (for drill-down histogram)"""
    try:
        customers, projects, resources, start_date, end_date = parse_filters(request)
        where_clause, params = build_where_clause(customers, projects, resources, start_date, end_date)
        
        # Get the duration bucket parameter
        duration_bucket = request.args.get('bucket', '').strip()
        if not duration_bucket:
            return jsonify({'error': 'Duration bucket parameter is required'}), 400
        
        conn = get_db_connection()
        cursor = conn.cursor(cursor_factory=RealDictCursor)
        
        # Map bucket names to duration ranges
        bucket_conditions = {
            '0-30 days': 'duration_days <= 30',
            '31-60 days': 'duration_days > 30 AND duration_days <= 60',
            '61-90 days': 'duration_days > 60 AND duration_days <= 90',
            '91-120 days': 'duration_days > 90 AND duration_days <= 120',
            '121-180 days': 'duration_days > 120 AND duration_days <= 180',
            '181-365 days': 'duration_days > 180 AND duration_days <= 365',
            '365+ days': 'duration_days > 365'
        }
        
        if duration_bucket not in bucket_conditions:
            return jsonify({'error': f'Invalid duration bucket: {duration_bucket}'}), 400
        
        duration_condition = bucket_conditions[duration_bucket]
        
        query = f"""
        WITH project_durations AS (
            SELECT 
                project,
                customer_name,
                customer_category,
                SUM(revenue) as total_revenue,
                SUM(billable_hours) as total_hours,
                COUNT(DISTINCT resource_name) as resource_count,
                (MAX(worked_date) - MIN(worked_date) + 1) as duration_days
            FROM project_data 
            WHERE {where_clause}
            GROUP BY project, customer_name, customer_category
        ),
        filtered_projects AS (
            SELECT 
                project,
                customer_name,
                customer_category,
                total_revenue,
                total_hours,
                resource_count,
                duration_days
            FROM project_durations
            WHERE {duration_condition}
        )
        SELECT 
            project,
            customer_name,
            customer_category,
            total_revenue,
            total_hours,
            resource_count,
            duration_days
        FROM filtered_projects
        ORDER BY total_revenue DESC
        LIMIT 5
        """
        
        cursor.execute(query, params)
        results = cursor.fetchall()
        
        bucket_projects = [
            {
                'project': row['project'][:40] + '...' if len(row['project']) > 40 else row['project'],
                'fullProject': row['project'],
                'customer': row['customer_name'],
                'category': row['customer_category'],
                'revenue': float(row['total_revenue']),
                'hours': float(row['total_hours']),
                'resources': row['resource_count'],
                'duration': row['duration_days']
            }
            for row in results
        ]
        
        cursor.close()
        conn.close()
        
        return jsonify({
            'bucketProjects': bucket_projects,
            'bucket': duration_bucket
        })
        
    except Exception as e:
        logger.error(f"Error in projects by duration: {e}")
        return jsonify({'error': str(e)}), 500

@app.route('/api/project-analytics/projects-by-customer', methods=['GET'])
def projects_by_customer():
    """Get projects for a specific customer (for drill-down treemap)"""
    try:
        customers, projects, resources, start_date, end_date = parse_filters(request)
        where_clause, params = build_where_clause(customers, projects, resources, start_date, end_date)
        
        # Get the customer parameter
        customer = request.args.get('customer', '').strip()
        if not customer:
            return jsonify({'error': 'Customer parameter is required'}), 400
        
        conn = get_db_connection()
        cursor = conn.cursor(cursor_factory=RealDictCursor)
        
        query = f"""
        SELECT 
            project,
            customer_name,
            customer_category,
            SUM(revenue) as total_revenue,
            SUM(billable_hours) as total_hours,
            COUNT(DISTINCT resource_name) as resource_count
        FROM project_data 
        WHERE {where_clause} AND customer_name = %s
        GROUP BY project, customer_name, customer_category
        ORDER BY total_revenue DESC
        """
        
        # Add customer parameter to params
        all_params = params + [customer]
        cursor.execute(query, all_params)
        results = cursor.fetchall()
        
        customer_projects = [
            {
                'name': row['project'][:25] + '...' if len(row['project']) > 25 else row['project'],
                'fullName': row['project'],
                'value': float(row['total_revenue']),
                'hours': float(row['total_hours']),
                'resources': row['resource_count'],
                'category': row['customer_category']
            }
            for row in results
        ]
        
        cursor.close()
        conn.close()
        
        return jsonify({
            'customerProjects': customer_projects,
            'customer': customer
        })
        
    except Exception as e:
        logger.error(f"Error in projects by customer: {e}")
        return jsonify({'error': str(e)}), 500

# ======= RESOURCE PERFORMANCE ENDPOINTS =======

@app.route('/api/resource-performance', methods=['GET'])
def resource_performance():
    """Main resource performance analysis endpoint"""
    try:
        customers, projects, resources, start_date, end_date = parse_filters(request)
        where_clause, params = build_where_clause(customers, projects, resources, start_date, end_date)
        
        conn = get_db_connection()
        cursor = conn.cursor(cursor_factory=RealDictCursor)
        
        # Main resource performance analysis query
        # Filter out contractors and calculate key metrics
        query = f"""
        WITH resource_data AS (
            SELECT 
                resource_name,
                SUM(billable_hours) as total_hours,
                SUM(revenue) as total_revenue,
                COUNT(DISTINCT project) as project_count,
                COUNT(DISTINCT customer_name) as customer_count,
                COUNT(DISTINCT TO_CHAR(worked_date, 'YYYY-MM')) as months_active,
                AVG(hourly_rate) as avg_hourly_rate
            FROM project_data 
            WHERE {where_clause}
            AND resource_name NOT ILIKE '%%contractor%%'
            GROUP BY resource_name
        ),
        resource_metrics AS (
            SELECT 
                resource_name,
                total_hours,
                total_revenue,
                project_count,
                customer_count,
                months_active,
                avg_hourly_rate,
                CASE 
                    WHEN total_hours > 0 
                    THEN total_revenue / total_hours 
                    ELSE 0 
                END as blended_rate,
                CASE 
                    WHEN project_count > 0 
                    THEN total_revenue / project_count 
                    ELSE 0 
                END as revenue_per_project,
                CASE 
                    WHEN months_active > 0 
                    THEN total_hours / months_active 
                    ELSE 0 
                END as hours_per_month
            FROM resource_data
            WHERE total_revenue > 0 AND total_hours > 0
        )
        SELECT 
            resource_name,
            total_hours,
            total_revenue,
            project_count,
            customer_count,
            months_active,
            avg_hourly_rate,
            blended_rate,
            revenue_per_project,
            hours_per_month
        FROM resource_metrics
        ORDER BY total_revenue DESC
        """
        
        cursor.execute(query, params)
        results = cursor.fetchall()
        
        # Process results for clustering data
        resource_data = []
        for row in results:
            resource_data.append({
                'resourceName': row['resource_name'],
                'totalHours': float(row['total_hours']),
                'totalRevenue': float(row['total_revenue']),
                'projectCount': row['project_count'],
                'customerCount': row['customer_count'],
                'monthsActive': row['months_active'],
                'avgHourlyRate': float(row['avg_hourly_rate']),
                'blendedRate': float(row['blended_rate']),
                'revenuePerProject': float(row['revenue_per_project']),
                'hoursPerMonth': float(row['hours_per_month'])
            })
        
        cursor.close()
        conn.close()
        
        return jsonify({
            'resourceData': resource_data
        })
        
    except Exception as e:
        logger.error(f"Error in resource performance analysis: {e}")
        return jsonify({'error': str(e)}), 500

@app.route('/api/resource-performance/top-resources', methods=['GET'])
def top_resources():
    """Top 10 resources by revenue"""
    try:
        customers, projects, resources, start_date, end_date = parse_filters(request)
        where_clause, params = build_where_clause(customers, projects, resources, start_date, end_date)
        
        conn = get_db_connection()
        cursor = conn.cursor(cursor_factory=RealDictCursor)
        
        # Top 10 resources by revenue query
        query = f"""
        SELECT 
            resource_name,
            SUM(billable_hours) as total_hours,
            SUM(revenue) as total_revenue,
            COUNT(DISTINCT project) as project_count,
            COUNT(DISTINCT customer_name) as customer_count,
            CASE 
                WHEN SUM(billable_hours) > 0 
                THEN SUM(revenue) / SUM(billable_hours) 
                ELSE 0 
            END as blended_rate
        FROM project_data 
        WHERE {where_clause}
        AND resource_name NOT ILIKE '%%contractor%%'
        GROUP BY resource_name
        HAVING SUM(revenue) > 0 AND SUM(billable_hours) > 0
        ORDER BY SUM(revenue) DESC
        LIMIT 10
        """
        
        cursor.execute(query, params)
        results = cursor.fetchall()
        
        top_resources_data = [
            {
                'resourceName': row['resource_name'][:20] + '...' if len(row['resource_name']) > 20 else row['resource_name'],
                'fullName': row['resource_name'],
                'totalRevenue': float(row['total_revenue']),
                'totalHours': float(row['total_hours']),
                'projectCount': row['project_count'],
                'customerCount': row['customer_count'],
                'blendedRate': float(row['blended_rate'])
            }
            for row in results
        ]
        
        cursor.close()
        conn.close()
        
        return jsonify({'topResources': top_resources_data})
        
    except Exception as e:
        logger.error(f"Error in top resources: {e}")
        return jsonify({'error': str(e)}), 500

@app.route('/api/resource-performance/clustering', methods=['GET'])
def resource_clustering():
    """Resource clustering analysis with 3D data"""
    try:
        customers, projects, resources, start_date, end_date = parse_filters(request)
        where_clause, params = build_where_clause(customers, projects, resources, start_date, end_date)
        
        conn = get_db_connection()
        cursor = conn.cursor(cursor_factory=RealDictCursor)
        
        # Resource clustering data query
        query = f"""
        WITH resource_metrics AS (
            SELECT 
                resource_name,
                SUM(billable_hours) as total_hours,
                SUM(revenue) as total_revenue,
                COUNT(DISTINCT project) as project_count,
                COUNT(DISTINCT customer_name) as customer_count,
                COUNT(DISTINCT TO_CHAR(worked_date, 'YYYY-MM')) as months_active,
                AVG(hourly_rate) as avg_hourly_rate
            FROM project_data 
            WHERE {where_clause}
            AND resource_name NOT ILIKE '%%contractor%%'
            GROUP BY resource_name
            HAVING SUM(revenue) > 0 AND SUM(billable_hours) > 0
        ),
        clustering_data AS (
            SELECT 
                resource_name,
                total_hours,
                total_revenue,
                project_count,
                customer_count,
                months_active,
                avg_hourly_rate,
                CASE 
                    WHEN months_active > 0 
                    THEN total_hours / months_active 
                    ELSE 0 
                END as hours_per_month,
                CASE 
                    WHEN total_hours > 0 
                    THEN total_revenue / total_hours 
                    ELSE 0 
                END as blended_rate
            FROM resource_metrics
        ),
        clustered_resources AS (
            SELECT 
                *,
                -- Updated clustering logic based on business requirements:
                -- Volume Leaders: High monthly hours (>90) with focused client work (<10 clients)
                -- Versatile Contributors: High client diversity (>=10) with substantial hours (>45)
                -- Support Resources: Lower monthly hours (<45)
                CASE 
                    WHEN hours_per_month > 90 AND customer_count < 10 THEN 'Volume Leaders'
                    WHEN customer_count >= 10 AND hours_per_month > 45 THEN 'Versatile Contributors'
                    WHEN hours_per_month < 45 THEN 'Support Resources'
                    ELSE 'Support Resources'
                END as cluster_name
            FROM clustering_data
        )
        SELECT 
            resource_name,
            total_hours,
            total_revenue,
            project_count,
            customer_count,
            months_active,
            hours_per_month,
            blended_rate,
            cluster_name
        FROM clustered_resources
        ORDER BY total_revenue DESC
        """
        
        cursor.execute(query, params)
        results = cursor.fetchall()
        
        # Process clustering data
        clustering_data = []
        cluster_summary = {}
        
        for row in results:
            cluster_name = row['cluster_name']
            
            # Individual resource data for 3D plot
            clustering_data.append({
                'resourceName': row['resource_name'],
                'totalHours': float(row['total_hours']),
                'totalRevenue': float(row['total_revenue']),
                'projectCount': row['project_count'],
                'customerCount': row['customer_count'],
                'monthsActive': row['months_active'],
                'hoursPerMonth': float(row['hours_per_month']),
                'blendedRate': float(row['blended_rate']),
                'clusterName': cluster_name,
                # 3D plot coordinates (now x=hours, y=customers, z=projects)
                'x': float(row['hours_per_month']),
                'y': row['customer_count'],
                'z': row['project_count']
            })
            
            # Aggregate cluster summary
            if cluster_name not in cluster_summary:
                cluster_summary[cluster_name] = {
                    'clusterName': cluster_name,
                    'resourceCount': 0,
                    'totalRevenue': 0,
                    'totalHours': 0,
                    'avgHoursPerMonth': 0,
                    'avgBlendedRate': 0,
                    'avgProjects': 0,
                    'avgCustomers': 0
                }
            
            cluster_summary[cluster_name]['resourceCount'] += 1
            cluster_summary[cluster_name]['totalRevenue'] += float(row['total_revenue'])
            cluster_summary[cluster_name]['totalHours'] += float(row['total_hours'])
            cluster_summary[cluster_name]['avgHoursPerMonth'] += float(row['hours_per_month'])
            cluster_summary[cluster_name]['avgBlendedRate'] += float(row['blended_rate'])
            cluster_summary[cluster_name]['avgProjects'] += row['project_count']
            cluster_summary[cluster_name]['avgCustomers'] += row['customer_count']
        
        # Calculate averages for cluster summary
        total_revenue = sum(float(row['total_revenue']) for row in results)
        for cluster in cluster_summary.values():
            count = cluster['resourceCount']
            if count > 0:
                cluster['avgHoursPerMonth'] = cluster['avgHoursPerMonth'] / count
                cluster['avgBlendedRate'] = cluster['avgBlendedRate'] / count
                cluster['avgProjects'] = cluster['avgProjects'] / count
                cluster['avgCustomers'] = cluster['avgCustomers'] / count
                cluster['revenuePercentage'] = (cluster['totalRevenue'] / total_revenue * 100) if total_revenue > 0 else 0
        
        cluster_summary_list = list(cluster_summary.values())
        cluster_summary_list.sort(key=lambda x: x['revenuePercentage'], reverse=True)
        
        cursor.close()
        conn.close()
        
        return jsonify({
            'clusteringData': clustering_data,
            'clusterSummary': cluster_summary_list
        })
        
    except Exception as e:
        logger.error(f"Error in resource clustering: {e}")
        return jsonify({'error': str(e)}), 500

@app.route('/api/resource-performance/cluster-revenue-over-time', methods=['GET'])
def cluster_revenue_over_time():
    """Revenue contribution by cluster over time"""
    try:
        customers, projects, resources, start_date, end_date = parse_filters(request)
        where_clause, params = build_where_clause(customers, projects, resources, start_date, end_date)
        
        conn = get_db_connection()
        cursor = conn.cursor(cursor_factory=RealDictCursor)
        
        # First get cluster assignments for each resource
        cluster_query = f"""
        WITH resource_metrics AS (
            SELECT 
                resource_name,
                SUM(billable_hours) as total_hours,
                SUM(revenue) as total_revenue,
                COUNT(DISTINCT project) as project_count,
                COUNT(DISTINCT customer_name) as customer_count,
                COUNT(DISTINCT TO_CHAR(worked_date, 'YYYY-MM')) as months_active
            FROM project_data 
            WHERE {where_clause}
            AND resource_name NOT ILIKE '%%contractor%%'
            GROUP BY resource_name
            HAVING SUM(revenue) > 0 AND SUM(billable_hours) > 0
        ),
        resource_clusters AS (
            SELECT 
                resource_name,
                CASE 
                    WHEN (total_hours / months_active) > 90 
                         AND customer_count < 10 THEN 'Volume_Leaders'
                    WHEN customer_count >= 10 
                         AND (total_hours / months_active) > 45 THEN 'Versatile_Contributors'
                    WHEN (total_hours / months_active) < 45 THEN 'Support_Resources'
                    ELSE 'Support_Resources'
                END as cluster_name
            FROM resource_metrics
        )
        SELECT DISTINCT resource_name, cluster_name FROM resource_clusters
        """
        
        cursor.execute(cluster_query, params)
        cluster_assignments = {row['resource_name']: row['cluster_name'] for row in cursor.fetchall()}
        
        # Now get revenue over time with cluster assignments
        time_query = f"""
        SELECT 
            EXTRACT(YEAR FROM worked_date) as year,
            resource_name,
            SUM(revenue) as revenue
        FROM project_data 
        WHERE {where_clause}
        AND resource_name NOT ILIKE '%%contractor%%'
        GROUP BY EXTRACT(YEAR FROM worked_date), resource_name
        ORDER BY year, resource_name
        """
        
        cursor.execute(time_query, params)
        time_results = cursor.fetchall()
        
        # Organize data by year and cluster
        yearly_data = {}
        clusters = ['Volume_Leaders', 'Versatile_Contributors', 'Support_Resources']
        
        for row in time_results:
            year = str(int(row['year']))
            resource = row['resource_name']
            revenue = float(row['revenue'])
            
            # Get cluster for this resource
            cluster = cluster_assignments.get(resource, 'Support_Resources')
            
            if year not in yearly_data:
                yearly_data[year] = {'year': year}
                for c in clusters:
                    yearly_data[year][c] = 0
            
            yearly_data[year][cluster] += revenue
        
        # Convert to list and sort by year
        cluster_over_time = list(yearly_data.values())
        cluster_over_time.sort(key=lambda x: int(x['year']))
        
        cursor.close()
        conn.close()
        
        return jsonify({
            'clusterOverTime': cluster_over_time,
            'clusters': clusters
        })
        
    except Exception as e:
        logger.error(f"Error in cluster revenue over time: {e}")
        return jsonify({'error': str(e)}), 500

@app.route('/api/resource-performance/kpis', methods=['GET'])
def resource_kpis():
    """Resource performance KPIs"""
    try:
        customers, projects, resources, start_date, end_date = parse_filters(request)
        where_clause, params = build_where_clause(customers, projects, resources, start_date, end_date)
        
        conn = get_db_connection()
        cursor = conn.cursor(cursor_factory=RealDictCursor)
        
        # KPIs calculation query
        query = f"""
        WITH resource_kpis AS (
            SELECT 
                SUM(revenue) as total_revenue,
                SUM(billable_hours) as total_hours,
                COUNT(DISTINCT resource_name) as active_resources,
                CASE 
                    WHEN SUM(billable_hours) > 0 
                    THEN SUM(revenue) / SUM(billable_hours) 
                    ELSE 0 
                END as avg_hourly_rate
            FROM project_data 
            WHERE {where_clause}
            AND resource_name NOT ILIKE '%%contractor%%'
        )
        SELECT 
            total_revenue,
            total_hours,
            active_resources,
            avg_hourly_rate
        FROM resource_kpis
        """
        
        cursor.execute(query, params)
        result = cursor.fetchone()
        
        if result:
            kpis = {
                'totalRevenue': float(result['total_revenue']) if result['total_revenue'] else 0,
                'totalHours': float(result['total_hours']) if result['total_hours'] else 0,
                'activeResources': result['active_resources'] if result['active_resources'] else 0,
                'avgHourlyRate': float(result['avg_hourly_rate']) if result['avg_hourly_rate'] else 0
            }
        else:
            kpis = {
                'totalRevenue': 0,
                'totalHours': 0,
                'activeResources': 0,
                'avgHourlyRate': 0
            }
        
        cursor.close()
        conn.close()
        
        return jsonify({'kpis': kpis})
        
    except Exception as e:
        logger.error(f"Error in resource KPIs: {e}")
        return jsonify({'error': str(e)}), 500

@app.route('/api/project-analytics/portfolio-mix', methods=['GET'])
def portfolio_mix():
    """Project portfolio mix analysis for 100% stacked bar chart"""
    try:
        customers, projects, resources, start_date, end_date = parse_filters(request)
        where_clause, params = build_where_clause(customers, projects, resources, start_date, end_date)
        
        conn = get_db_connection()
        cursor = conn.cursor(cursor_factory=RealDictCursor)
        
        # Step 1: Get all project summaries to calculate thresholds (60th percentile for hours, 40th for rate)
        threshold_query = f"""
        WITH project_summary AS (
            SELECT 
                SUM(revenue) as total_revenue,
                SUM(billable_hours) as total_hours
            FROM project_data
            WHERE {where_clause} AND project IS NOT NULL
            GROUP BY project
            HAVING SUM(billable_hours) > 0 AND SUM(revenue) > 0
        )
        SELECT 
            percentile_cont(0.6) WITHIN GROUP (ORDER BY total_hours) as threshold_hours,
            percentile_cont(0.4) WITHIN GROUP (ORDER BY total_revenue / total_hours) as threshold_rate
        FROM project_summary
        """
        cursor.execute(threshold_query, params)
        thresholds = cursor.fetchone()
        threshold_hours = thresholds['threshold_hours'] if thresholds and thresholds['threshold_hours'] else 0
        threshold_rate = thresholds['threshold_rate'] if thresholds and thresholds['threshold_rate'] else 0

        # Step 2: Categorize projects and aggregate revenue by customer category
        categorization_query = f"""
        WITH project_summary AS (
            SELECT 
                project,
                customer_category,
                SUM(revenue) as total_revenue,
                SUM(billable_hours) as total_hours,
                CASE WHEN SUM(billable_hours) > 0 THEN SUM(revenue) / SUM(billable_hours) ELSE 0 END as avg_rate
            FROM project_data
            WHERE {where_clause} AND project IS NOT NULL AND customer_category IS NOT NULL AND TRIM(customer_category) != ''
            GROUP BY project, customer_category
        ),
        categorized_projects AS (
            SELECT
                customer_category,
                total_revenue,
                CASE
                    WHEN total_hours <= %s AND avg_rate >= %s THEN 'High-Value Specialists'
                    WHEN total_hours > %s AND avg_rate >= %s THEN 'Strategic Partnerships'
                    WHEN total_hours <= %s AND avg_rate < %s THEN 'Routine Tasks'
                    ELSE 'Efficiency Drains'
                END as quadrant
            FROM project_summary
            WHERE total_hours > 0 AND total_revenue > 0
        )
        SELECT 
            customer_category,
            quadrant,
            SUM(total_revenue) as quadrant_revenue
        FROM categorized_projects
        GROUP BY customer_category, quadrant
        ORDER BY customer_category, quadrant
        """
        categorization_params = params + [threshold_hours, threshold_rate, threshold_hours, threshold_rate, threshold_hours, threshold_rate]
        cursor.execute(categorization_query, categorization_params)
        results = cursor.fetchall()

        # Step 3: Pivot the data for the 100% stacked bar chart
        portfolio_data = {}
        for row in results:
            category = row['customer_category']
            if category not in portfolio_data:
                portfolio_data[category] = {
                    'category': category,
                    'High-Value Specialists': 0,
                    'Strategic Partnerships': 0,
                    'Routine Tasks': 0,
                    'Efficiency Drains': 0,
                }
            portfolio_data[category][row['quadrant']] = float(row['quadrant_revenue'])

        cursor.close()
        conn.close()
        
        return jsonify({'portfolioData': list(portfolio_data.values())})
        
    except Exception as e:
        logger.error(f"Error in portfolio mix analysis: {e}")
        return jsonify({'error': str(e)}), 500

if __name__ == '__main__':
    app.run(host='0.0.0.0', port=5000, debug=True)