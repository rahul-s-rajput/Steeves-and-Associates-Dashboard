import psycopg2
from psycopg2.extras import RealDictCursor
import os
import json
import logging
from dotenv import load_dotenv

# Load environment variables from .env file
load_dotenv()

# Configure logging
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

# --- Database Configuration ---
DB_CONFIG = {
    'host': os.getenv('DB_HOST'),
    'database': os.getenv('DB_NAME'),
    'user': os.getenv('DB_USER'),
    'password': os.getenv('DB_PASSWORD'),
    'port': os.getenv('DB_PORT'),
}

def get_db_connection():
    """Get database connection with error handling and validation"""
    try:
        config = DB_CONFIG.copy()
        required_vars = ['host', 'database', 'user', 'password', 'port']
        missing_vars = [key for key in required_vars if not config.get(key)]
        if missing_vars:
            raise ValueError(f"Missing required database environment variables: {', '.join(missing_vars)}")

        config['port'] = int(config['port'])
        
        conn = psycopg2.connect(**config)
        return conn
    except (psycopg2.Error, ValueError, TypeError) as e:
        logger.error(f"Database connection error: {e}")
        raise

def get_overall_stats(cursor):
    """Fetches overall project statistics."""
    logger.info("Fetching overall stats...")
    query = """
    SELECT 
        SUM(revenue) as total_revenue,
        COUNT(DISTINCT project) as total_projects,
        COUNT(DISTINCT customer_name) as total_customers,
        SUM(billable_hours) as total_hours,
        CASE 
            WHEN SUM(billable_hours) > 0 
            THEN SUM(revenue) / SUM(billable_hours)
            ELSE 0 
        END as blended_rate
    FROM project_data;
    """
    cursor.execute(query)
    stats = cursor.fetchone()
    return {
        'total_revenue': float(stats['total_revenue']) if stats['total_revenue'] else 0,
        'blended_rate': float(stats['blended_rate']) if stats['blended_rate'] else 0,
        'total_projects': int(stats['total_projects']) if stats['total_projects'] else 0,
        'total_customers': int(stats['total_customers']) if stats['total_customers'] else 0,
        'total_hours': float(stats['total_hours']) if stats['total_hours'] else 0,
    }

def get_top_items(cursor, field, limit=5):
    """Fetches top items by revenue."""
    logger.info(f"Fetching top {limit} {field}s by revenue...")
    query = f"""
    SELECT 
        {field},
        SUM(revenue) as total_revenue
    FROM project_data
    WHERE {field} IS NOT NULL AND TRIM({field}) != ''
    GROUP BY {field}
    ORDER BY total_revenue DESC
    LIMIT %s;
    """
    cursor.execute(query, (limit,))
    results = cursor.fetchall()
    return [{row[f'{field}']: float(row['total_revenue'])} for row in results]

def get_annual_growth(cursor):
    """Fetches annual growth summary."""
    logger.info("Fetching annual growth summary...")
    query = """
    WITH yearly_data AS (
        SELECT 
            EXTRACT(YEAR FROM worked_date) as year,
            SUM(revenue) as revenue
        FROM project_data 
        GROUP BY EXTRACT(YEAR FROM worked_date)
        ORDER BY year
    ),
    yoy_growth AS (
        SELECT 
            current_year.year,
            current_year.revenue,
            CASE 
                WHEN previous_year.revenue > 0 
                THEN ((current_year.revenue - previous_year.revenue) / previous_year.revenue * 100)
                ELSE NULL
            END as yoy_growth_rate
        FROM yearly_data current_year
        LEFT JOIN yearly_data previous_year 
            ON current_year.year = previous_year.year + 1
    )
    SELECT year, revenue, yoy_growth_rate FROM yoy_growth ORDER BY year;
    """
    cursor.execute(query)
    results = cursor.fetchall()
    return [
        {
            'year': int(row['year']),
            'revenue': float(row['revenue']),
            'yoy_growth_rate_percent': round(float(row['yoy_growth_rate']), 2) if row['yoy_growth_rate'] else None
        } for row in results
    ]

def get_top_resources(cursor, limit=5):
    """Fetches top performing resources by revenue."""
    logger.info(f"Fetching top {limit} resources by revenue...")
    query = """
    SELECT 
        resource_name,
        SUM(revenue) as total_revenue
    FROM project_data
    WHERE resource_name NOT ILIKE '%%contractor%%' AND resource_name IS NOT NULL
    GROUP BY resource_name
    HAVING SUM(revenue) > 0
    ORDER BY total_revenue DESC
    LIMIT %s;
    """
    cursor.execute(query, (limit,))
    results = cursor.fetchall()
    return [{row['resource_name']: float(row['total_revenue'])} for row in results]

def get_seasonal_kpis(cursor):
    """Fetches key seasonal indicators."""
    logger.info("Fetching seasonal KPIs...")
    query = """
    WITH monthly_data AS (
        SELECT 
            TRIM(TO_CHAR(worked_date, 'Month')) as month_name,
            SUM(revenue) as revenue
        FROM project_data 
        GROUP BY 1, EXTRACT(MONTH FROM worked_date)
        ORDER BY EXTRACT(MONTH FROM worked_date)
    ),
    ranked_months AS (
        SELECT *, ROW_NUMBER() OVER (ORDER BY revenue ASC) as revenue_rank
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
        (SELECT month_name FROM ranked_months WHERE revenue = (SELECT MIN(revenue) FROM monthly_data) LIMIT 1) as lowest_month,
        (SELECT MIN(revenue) FROM monthly_data) as lowest_month_revenue,
        (SELECT month_name FROM ranked_months WHERE revenue = (SELECT MAX(revenue) FROM monthly_data) LIMIT 1) as highest_month,
        (SELECT MAX(revenue) FROM monthly_data) as highest_month_revenue,
        (SELECT STRING_AGG(month_name, ', ') FROM ranked_months WHERE revenue_rank <= 3) as low_season_months,
        (SELECT CASE WHEN AVG(revenue) > 0 THEN ((MAX(revenue) - MIN(revenue)) / AVG(revenue) * 100) ELSE 0 END FROM monthly_data) as seasonal_variance_percent
    FROM seasonal_stats
    LIMIT 1;
    """
    cursor.execute(query)
    kpis = cursor.fetchone()
    return {
        'highest_revenue_month': {'month': kpis['highest_month'], 'revenue': float(kpis['highest_month_revenue'])},
        'lowest_revenue_month': {'month': kpis['lowest_month'], 'revenue': float(kpis['lowest_month_revenue'])},
        'low_season_months': kpis['low_season_months'].split(', ') if kpis['low_season_months'] else [],
        'seasonal_variance_percent': round(float(kpis['seasonal_variance_percent']), 2) if kpis['seasonal_variance_percent'] else 0
    }

def get_project_portfolio_summary(cursor):
    """Calculates revenue distribution across the four project quadrants."""
    logger.info("Fetching project portfolio summary...")
    # Step 1: Get thresholds (60th percentile for hours, 40th for rate)
    threshold_query = """
    WITH project_summary AS (
        SELECT 
            SUM(billable_hours) as total_hours,
            CASE WHEN SUM(billable_hours) > 0 THEN SUM(revenue) / SUM(billable_hours) ELSE 0 END as avg_rate
        FROM project_data
        WHERE project IS NOT NULL
        GROUP BY project
        HAVING SUM(billable_hours) > 0 AND SUM(revenue) > 0
    )
    SELECT 
        percentile_cont(0.6) WITHIN GROUP (ORDER BY total_hours) as threshold_hours,
        percentile_cont(0.4) WITHIN GROUP (ORDER BY avg_rate) as threshold_rate
    FROM project_summary;
    """
    cursor.execute(threshold_query)
    thresholds = cursor.fetchone()
    threshold_hours = thresholds['threshold_hours'] if thresholds and thresholds['threshold_hours'] else 0
    threshold_rate = thresholds['threshold_rate'] if thresholds and thresholds['threshold_rate'] else 0

    # Step 2: Categorize projects and aggregate revenue
    categorization_query = """
    WITH project_summary AS (
        SELECT
            SUM(revenue) as total_revenue,
            SUM(billable_hours) as total_hours,
            CASE WHEN SUM(billable_hours) > 0 THEN SUM(revenue) / SUM(billable_hours) ELSE 0 END as avg_rate
        FROM project_data
        WHERE project IS NOT NULL
        GROUP BY project
    ),
    categorized_projects AS (
        SELECT
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
        quadrant,
        SUM(total_revenue) as quadrant_revenue,
        COUNT(*) as project_count
    FROM categorized_projects
    GROUP BY quadrant;
    """
    cursor.execute(categorization_query, (threshold_hours, threshold_rate, threshold_hours, threshold_rate, threshold_hours, threshold_rate))
    results = cursor.fetchall()

    portfolio_summary = {row['quadrant']: {'total_revenue': float(row['quadrant_revenue']), 'project_count': int(row['project_count'])} for row in results}
    return {
        "description": "Projects categorized by value and effort. Thresholds are 60th percentile for hours and 40th percentile for hourly rate.",
        "quadrants": portfolio_summary
    }

def get_new_business_summary(cursor):
    """Calculates revenue and count of new projects and customers in the most recent year."""
    logger.info("Fetching new business summary for the latest year...")
    query = """
    WITH latest_year AS (
        SELECT MAX(EXTRACT(YEAR FROM worked_date))::int as year FROM project_data
    ),
    new_projects AS (
        SELECT 
            p.project,
            MIN(p.worked_date) as start_date
        FROM project_data p
        GROUP BY p.project
        HAVING EXTRACT(YEAR FROM MIN(p.worked_date)) = (SELECT year FROM latest_year)
    ),
    new_customers AS (
        SELECT
            c.customer_name,
            MIN(c.worked_date) as first_contact_date
        FROM project_data c
        GROUP BY c.customer_name
        HAVING EXTRACT(YEAR FROM MIN(c.worked_date)) = (SELECT year FROM latest_year)
    )
    SELECT
        (SELECT year FROM latest_year) as year,
        (SELECT COUNT(*) FROM new_projects) as new_project_count,
        (SELECT COALESCE(SUM(revenue), 0) FROM project_data WHERE project IN (SELECT project FROM new_projects)) as new_project_revenue,
        (SELECT COUNT(*) FROM new_customers) as new_customer_count,
        (SELECT COALESCE(SUM(revenue), 0) FROM project_data WHERE customer_name IN (SELECT customer_name FROM new_customers)) as new_customer_revenue;
    """
    cursor.execute(query)
    results = cursor.fetchone()
    return {
        'year': int(results['year']) if results['year'] else 'N/A',
        'new_project_count': int(results['new_project_count']),
        'new_project_revenue': float(results['new_project_revenue']),
        'new_customer_count': int(results['new_customer_count']),
        'new_customer_revenue': float(results['new_customer_revenue'])
    }

def get_resource_cluster_summary(cursor):
    """Calculates the number of resources and their total revenue contribution per performance cluster."""
    logger.info("Fetching resource cluster summary...")
    query = """
    WITH resource_metrics AS (
        SELECT 
            resource_name,
            SUM(billable_hours) as total_hours,
            SUM(revenue) as total_revenue,
            COUNT(DISTINCT customer_name) as customer_count,
            COUNT(DISTINCT TO_CHAR(worked_date, 'YYYY-MM')) as months_active
        FROM project_data 
        WHERE resource_name NOT ILIKE '%%contractor%%'
        GROUP BY resource_name
        HAVING SUM(revenue) > 0 AND SUM(billable_hours) > 0 AND COUNT(DISTINCT TO_CHAR(worked_date, 'YYYY-MM')) > 0
    ),
    clustered_resources AS (
        SELECT 
            total_revenue,
            CASE 
                WHEN (total_hours / months_active) > 90 AND customer_count < 10 THEN 'Volume Leaders'
                WHEN customer_count >= 10 AND (total_hours / months_active) > 45 THEN 'Versatile Contributors'
                ELSE 'Support Resources'
            END as cluster_name
        FROM resource_metrics
    )
    SELECT 
        cluster_name,
        COUNT(*) as resource_count,
        SUM(total_revenue) as total_revenue
    FROM clustered_resources
    GROUP BY cluster_name;
    """
    cursor.execute(query)
    results = cursor.fetchall()
    return {row['cluster_name']: {'resource_count': int(row['resource_count']), 'total_revenue': float(row['total_revenue'])} for row in results}

def get_detailed_project_kpis(cursor):
    """Calculates average project duration and revenue per project."""
    logger.info("Fetching detailed project KPIs...")
    query = """
    WITH project_summary AS (
        SELECT
            (MAX(worked_date) - MIN(worked_date) + 1) as duration_days,
            SUM(revenue) as total_revenue
        FROM project_data
        GROUP BY project
    )
    SELECT
        AVG(duration_days) as avg_duration_days,
        AVG(total_revenue) as avg_revenue_per_project
    FROM project_summary;
    """
    cursor.execute(query)
    results = cursor.fetchone()
    return {
        'avg_project_duration_days': round(float(results['avg_duration_days']), 2) if results['avg_duration_days'] else 0,
        'avg_revenue_per_project': round(float(results['avg_revenue_per_project']), 2) if results['avg_revenue_per_project'] else 0
    }

def get_yoy_monthly_growth_summary(cursor):
    """Calculates the average Year-over-Year growth rate for each month."""
    logger.info("Fetching YoY monthly growth summary...")
    query = """
    WITH monthly_yearly_data AS (
        SELECT 
            EXTRACT(YEAR FROM worked_date) as year,
            EXTRACT(MONTH FROM worked_date) as month_num,
            TRIM(TO_CHAR(worked_date, 'Month')) as month_name,
            SUM(revenue) as revenue
        FROM project_data 
        GROUP BY 1, 2, 3
    ),
    yoy_calculations AS (
        SELECT 
            current_year.month_name,
            current_year.month_num,
            ((current_year.revenue - previous_year.revenue) / previous_year.revenue * 100) as growth_rate
        FROM monthly_yearly_data current_year
        LEFT JOIN monthly_yearly_data previous_year 
            ON current_year.month_num = previous_year.month_num 
            AND current_year.year = previous_year.year + 1
        WHERE previous_year.revenue > 0
    )
    SELECT 
        month_name,
        AVG(growth_rate) as avg_growth_rate
    FROM yoy_calculations
    GROUP BY month_name, month_num
    ORDER BY month_num;
    """
    cursor.execute(query)
    results = cursor.fetchall()
    return {row['month_name']: f"{round(float(row['avg_growth_rate']), 2)}%" for row in results}

def get_blended_rate_trend(cursor):
    """Calculates the blended rate (revenue/hour) for each year."""
    logger.info("Fetching blended rate trend...")
    query = """
    SELECT 
        EXTRACT(YEAR FROM worked_date)::int as year,
        CASE 
            WHEN SUM(billable_hours) > 0 
            THEN SUM(revenue) / SUM(billable_hours)
            ELSE 0 
        END as blended_rate
    FROM project_data 
    GROUP BY EXTRACT(YEAR FROM worked_date)
    ORDER BY year;
    """
    cursor.execute(query)
    results = cursor.fetchall()
    return {row['year']: round(float(row['blended_rate']), 2) for row in results}

def get_duration_distribution_summary(cursor):
    """Summarizes project counts by duration buckets."""
    logger.info("Fetching project duration distribution...")
    query = """
    WITH project_durations AS (
        SELECT (MAX(worked_date) - MIN(worked_date) + 1) as duration_days
        FROM project_data 
        GROUP BY project
    )
    SELECT 
        CASE 
            WHEN duration_days <= 30 THEN '0-30 days'
            WHEN duration_days <= 90 THEN '31-90 days'
            WHEN duration_days <= 180 THEN '91-180 days'
            WHEN duration_days <= 365 THEN '181-365 days'
            ELSE '365+ days'
        END as duration_bucket,
        COUNT(*) as project_count
    FROM project_durations
    GROUP BY duration_bucket
    ORDER BY MIN(duration_days);
    """
    cursor.execute(query)
    results = cursor.fetchall()
    return {row['duration_bucket']: int(row['project_count']) for row in results}

def get_resource_kpis(cursor):
    """Fetches key KPIs for resources, excluding contractors."""
    logger.info("Fetching resource KPIs...")
    query = """
    SELECT 
        COUNT(DISTINCT resource_name) as active_resources
    FROM project_data 
    WHERE resource_name NOT ILIKE '%%contractor%%';
    """
    cursor.execute(query)
    results = cursor.fetchone()
    return {
        'active_resources_count': int(results['active_resources']) if results['active_resources'] else 0
    }

def get_forecasting_properties(cursor):
    """Calculates seasonality and trend strength from the data."""
    logger.info("Fetching time-series properties for forecasting...")
    query = """
    SELECT 
        TO_CHAR(worked_date, 'YYYY-MM-01')::date as month_start,
        SUM(revenue) as monthly_revenue
    FROM project_data 
    GROUP BY 1
    ORDER BY 1;
    """
    cursor.execute(query)
    results = cursor.fetchall()
    
    if len(results) < 24: # Need at least 2 full years for decomposition
        return {
            "error": "Insufficient data for seasonality/trend analysis (requires 24+ months).",
            "trend_strength": None,
            "seasonality_strength": None
        }

    try:
        import pandas as pd
        from statsmodels.tsa.seasonal import seasonal_decompose
        import numpy as np

        df = pd.DataFrame(results)
        df = df.set_index('month_start').asfreq('MS')
        
        decomposition = seasonal_decompose(df['monthly_revenue'].fillna(0), model='additive', period=12)
        
        # Strength of trend = 1 - Var(Residual) / Var(Trend + Residual)
        trend_strength = max(0, 1 - np.var(decomposition.resid) / np.var(decomposition.trend + decomposition.resid))
        # Strength of seasonality = 1 - Var(Residual) / Var(Seasonal + Residual)
        seasonality_strength = max(0, 1 - np.var(decomposition.resid) / np.var(decomposition.seasonal + decomposition.resid))

        return {
            "trend_strength": round(float(trend_strength), 4),
            "seasonality_strength": round(float(seasonality_strength), 4)
        }
    except ImportError:
        logger.warning("Could not import pandas or statsmodels. Skipping time-series property analysis.")
        return {"error": "Missing libraries (pandas, statsmodels) for time-series analysis."}
    except Exception as e:
        logger.error(f"Error during time-series analysis: {e}")
        return {"error": str(e)}

def get_top_by_category(cursor):
    """For each customer category, get the top 5 customers and projects by revenue."""
    logger.info("Fetching top customers and projects for each category...")
    
    # First, get all distinct categories
    cursor.execute("SELECT DISTINCT customer_category FROM project_data WHERE customer_category IS NOT NULL AND TRIM(customer_category) != ''")
    categories = [row['customer_category'] for row in cursor.fetchall()]
    
    category_breakdown = {}
    
    for category in categories:
        # Top 5 customers in this category
        customer_query = """
        SELECT customer_name, SUM(revenue) as total_revenue
        FROM project_data
        WHERE customer_category = %s
        GROUP BY customer_name
        ORDER BY total_revenue DESC
        LIMIT 5;
        """
        cursor.execute(customer_query, (category,))
        top_customers = {row['customer_name']: float(row['total_revenue']) for row in cursor.fetchall()}
        
        # Top 5 projects in this category
        project_query = """
        SELECT project, SUM(revenue) as total_revenue
        FROM project_data
        WHERE customer_category = %s
        GROUP BY project
        ORDER BY total_revenue DESC
        LIMIT 5;
        """
        cursor.execute(project_query, (category,))
        top_projects = {row['project']: float(row['total_revenue']) for row in cursor.fetchall()}
        
        category_breakdown[category] = {
            "top_customers_by_revenue": top_customers,
            "top_projects_by_revenue": top_projects
        }
    return category_breakdown

def get_low_season_performers(cursor):
    """Identifies top performers during the 3 lowest revenue months."""
    logger.info("Fetching top performers during low seasons...")
    
    # Get the 3 lowest revenue months
    low_months_query = """
    SELECT EXTRACT(MONTH FROM worked_date) as month_num
    FROM project_data
    GROUP BY 1
    ORDER BY SUM(revenue) ASC
    LIMIT 3;
    """
    cursor.execute(low_months_query)
    low_months = [row['month_num'] for row in cursor.fetchall()]
    
    if not low_months:
        return {"error": "Could not determine low season months."}
        
    # Get top customers during these months
    top_customers_query = """
    SELECT customer_name, SUM(revenue) as total_revenue
    FROM project_data
    WHERE EXTRACT(MONTH FROM worked_date) = ANY(%s)
    GROUP BY customer_name
    ORDER BY total_revenue DESC
    LIMIT 5;
    """
    cursor.execute(top_customers_query, (low_months,))
    top_customers = {row['customer_name']: float(row['total_revenue']) for row in cursor.fetchall()}

    # Get top projects during these months
    top_projects_query = """
    SELECT project, SUM(revenue) as total_revenue
    FROM project_data
    WHERE EXTRACT(MONTH FROM worked_date) = ANY(%s)
    GROUP BY project
    ORDER BY total_revenue DESC
    LIMIT 5;
    """
    cursor.execute(top_projects_query, (low_months,))
    top_projects = {row['project']: float(row['total_revenue']) for row in cursor.fetchall()}
    
    return {
        "description": "Top revenue generators during the three lowest-revenue months of the year.",
        "top_customers": top_customers,
        "top_projects": top_projects
    }

def get_revenue_forecast(cursor):
    """Generates a 12-month revenue forecast using a Holt-Winters model."""
    logger.info("Generating 12-month revenue forecast...")
    query = "SELECT TO_CHAR(worked_date, 'YYYY-MM-01')::date as month_start, SUM(revenue) as monthly_revenue FROM project_data GROUP BY 1 ORDER BY 1;"
    cursor.execute(query)
    results = cursor.fetchall()

    if len(results) < 24:
        return {"error": "Insufficient data for forecasting (requires 24+ months)."}

    try:
        import pandas as pd
        from statsmodels.tsa.holtwinters import ExponentialSmoothing

        df = pd.DataFrame(results)
        df['month_start'] = pd.to_datetime(df['month_start'])
        df['monthly_revenue'] = pd.to_numeric(df['monthly_revenue'], errors='coerce').fillna(0)
        df = df.set_index('month_start').asfreq('MS', fill_value=0)
        
        model = ExponentialSmoothing(df['monthly_revenue'], seasonal_periods=12, trend='add', seasonal='add', initialization_method="estimated").fit()
        forecast_values = model.forecast(12)
        
        last_date = df.index[-1]
        forecast_index = pd.date_range(start=last_date + pd.DateOffset(months=1), periods=12, freq='MS')

        return {date.strftime('%Y-%m'): round(float(value), 2) for date, value in zip(forecast_index, forecast_values)}

    except ImportError:
        return {"error": "Missing libraries (pandas, statsmodels) for forecasting."}
    except Exception as e:
        return {"error": f"Forecasting model failed: {str(e)}"}

def get_top_entity_profiles(cursor):
    """Creates profiles for the top 5 customers, projects, and resources."""
    logger.info("Creating profiles for top entities...")
    top_entities = {}

    # Top 5 Customers
    top_customers_query = "SELECT customer_name FROM project_data GROUP BY customer_name ORDER BY SUM(revenue) DESC LIMIT 5;"
    cursor.execute(top_customers_query)
    top_customers = [row['customer_name'] for row in cursor.fetchall()]
    customer_profiles = {}
    for customer in top_customers:
        profile_query = """
        SELECT SUM(revenue) as total_revenue, SUM(billable_hours) as total_hours, COUNT(DISTINCT project) as project_count
        FROM project_data WHERE customer_name = %s;
        """
        cursor.execute(profile_query, (customer,))
        profile = cursor.fetchone()
        customer_profiles[customer] = {key: float(value) for key, value in profile.items()}
    top_entities['customers'] = customer_profiles

    # Top 5 Projects
    top_projects_query = "SELECT project FROM project_data GROUP BY project ORDER BY SUM(revenue) DESC LIMIT 5;"
    cursor.execute(top_projects_query)
    top_projects = [row['project'] for row in cursor.fetchall()]
    project_profiles = {}
    for project in top_projects:
        profile_query = """
        SELECT 
            SUM(revenue) as total_revenue, 
            SUM(billable_hours) as total_hours, 
            STRING_AGG(DISTINCT customer_name, ', ') as customers,
            STRING_AGG(DISTINCT customer_category, ', ') as categories
        FROM project_data WHERE project = %s;
        """
        cursor.execute(profile_query, (project,))
        profile = cursor.fetchone()
        project_profiles[project] = {
            'total_revenue': float(profile['total_revenue']),
            'total_hours': float(profile['total_hours']),
            'customers': profile['customers'],
            'categories': profile['categories']
        }
    top_entities['projects'] = project_profiles

    # Top 5 Resources
    top_resources_query = "SELECT resource_name FROM project_data WHERE resource_name NOT ILIKE '%%contractor%%' GROUP BY resource_name ORDER BY SUM(revenue) DESC LIMIT 5;"
    cursor.execute(top_resources_query)
    top_resources = [row['resource_name'] for row in cursor.fetchall()]
    resource_profiles = {}
    for resource in top_resources:
        profile_query = """
        SELECT 
            SUM(revenue) as total_revenue, 
            SUM(billable_hours) as total_hours, 
            COUNT(DISTINCT project) as project_count,
            CASE WHEN SUM(billable_hours) > 0 THEN SUM(revenue)/SUM(billable_hours) ELSE 0 END as blended_rate
        FROM project_data WHERE resource_name = %s;
        """
        cursor.execute(profile_query, (resource,))
        profile = cursor.fetchone()
        resource_profiles[resource] = {key: float(value) for key, value in profile.items()}
    top_entities['resources'] = resource_profiles

    return top_entities

def get_data_summary():
    """Fetch data summary from the database"""
    summary = {}
    conn = None
    try:
        conn = get_db_connection()
        cursor = conn.cursor(cursor_factory=RealDictCursor)
        
        summary['overall_statistics'] = get_overall_stats(cursor)
        summary['top_5_customers_by_revenue'] = get_top_items(cursor, 'customer_name', 5)
        summary['top_5_projects_by_revenue'] = get_top_items(cursor, 'project', 5)
        summary['top_5_customer_categories_by_revenue'] = get_top_items(cursor, 'customer_category', 5)
        summary['annual_revenue_growth'] = get_annual_growth(cursor)
        summary['top_5_resources_by_revenue'] = get_top_resources(cursor, 5)
        summary['seasonal_highlights'] = get_seasonal_kpis(cursor)
        summary['project_portfolio_summary'] = get_project_portfolio_summary(cursor)
        summary['new_business_summary_latest_year'] = get_new_business_summary(cursor)
        summary['resource_performance_clusters'] = get_resource_cluster_summary(cursor)
        summary['detailed_project_kpis'] = get_detailed_project_kpis(cursor)
        summary['yoy_monthly_growth_summary'] = get_yoy_monthly_growth_summary(cursor)
        summary['blended_rate_trend_by_year'] = get_blended_rate_trend(cursor)
        summary['project_duration_distribution'] = get_duration_distribution_summary(cursor)
        summary['overall_resource_kpis'] = get_resource_kpis(cursor)
        summary['time_series_properties'] = get_forecasting_properties(cursor)
        summary['top_performers_by_category'] = get_top_by_category(cursor)
        summary['low_season_top_performers'] = get_low_season_performers(cursor)
        summary['revenue_forecast_next_12_months'] = get_revenue_forecast(cursor)
        summary['top_entity_profiles'] = get_top_entity_profiles(cursor)
        
        # Ensure the output file is saved in the same directory as the script
        output_dir = os.path.dirname(__file__)
        output_filename = os.path.join(output_dir, 'dataset_summary.json')

        with open(output_filename, 'w') as f:
            json.dump(summary, f, indent=4)
            
        logger.info(f"✅ Successfully generated summary and saved to {output_filename}")
        
    except (Exception, psycopg2.Error) as error:
        logger.error(f"Error while generating summary: {error}")
    finally:
        if conn:
            cursor.close()
            conn.close()
            logger.info("Database connection closed.")

if __name__ == '__main__':
    get_data_summary() 