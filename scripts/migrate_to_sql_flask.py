#!/usr/bin/env python3
"""
Python Migration Script for Education Dashboard
Migrates CSV data to PostgreSQL with optimized schema and indexes
"""

import pandas as pd
import psycopg2
from psycopg2.extras import execute_values
import os
import sys
from datetime import datetime
import time
import logging
from dotenv import load_dotenv

# Define paths relative to this script
SCRIPT_DIR = os.path.dirname(os.path.realpath(__file__))
PROJECT_ROOT = os.path.dirname(SCRIPT_DIR)
DOTENV_PATH = os.path.join(PROJECT_ROOT, 'dashboard-api', '.env')

# Load environment variables from .env file
load_dotenv(dotenv_path=DOTENV_PATH)

# Configure logging
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

# Database configuration
DB_CONFIG = {
    'host': os.getenv('DB_HOST'),
    'database': os.getenv('DB_NAME'),
    'user': os.getenv('DB_USER'),
    'password': os.getenv('DB_PASSWORD'),
    'port': os.getenv('DB_PORT')
}

# Paths
CSV_FILE_PATH = os.path.join(PROJECT_ROOT, 'dashboard-api', 'output_file_1.csv')

def get_db_connection():
    """Get database connection"""
    try:
        config = DB_CONFIG.copy()
        required_vars = ['host', 'database', 'user', 'password', 'port']
        missing_vars = [key for key in required_vars if not config.get(key)]
        if missing_vars:
            raise ValueError(f"Missing required database environment variables: {', '.join(missing_vars)}")
        
        config['port'] = int(config['port'])

        conn = psycopg2.connect(**config)
        conn.autocommit = True
        return conn
    except (psycopg2.Error, ValueError, TypeError) as e:
        logger.error(f"Database connection error: {e}")
        raise

def create_database_if_not_exists():
    """Create database if it doesn't exist"""
    try:
        # Connect to default postgres database first
        temp_config = DB_CONFIG.copy()
        temp_config['database'] = 'postgres'
        
        required_vars = ['host', 'user', 'password', 'port']
        missing_vars = [key for key in required_vars if not temp_config.get(key)]
        if missing_vars:
            raise ValueError(f"Missing required database environment variables for maintenance connection: {', '.join(missing_vars)}")

        temp_config['port'] = int(temp_config['port'])

        conn = psycopg2.connect(**temp_config)
        conn.autocommit = True
        cursor = conn.cursor()
        
        # Check if database exists
        cursor.execute("SELECT 1 FROM pg_catalog.pg_database WHERE datname = %s", (DB_CONFIG['database'],))
        exists = cursor.fetchone()
        
        if not exists:
            logger.info(f"Creating database: {DB_CONFIG['database']}")
            cursor.execute(f'CREATE DATABASE "{DB_CONFIG["database"]}"')
            logger.info("Database created successfully!")
        else:
            logger.info(f"Database {DB_CONFIG['database']} already exists")
        
        cursor.close()
        conn.close()
        
    except Exception as e:
        logger.error(f"Error creating database: {e}")
        raise

def create_schema():
    """Create database schema with optimized indexes"""
    try:
        conn = get_db_connection()
        cursor = conn.cursor()
        
        logger.info("Creating optimized database schema...")
        
        # Drop existing table if it exists
        cursor.execute("DROP TABLE IF EXISTS project_data CASCADE")
        
        # Create main table
        create_table_sql = """
        CREATE TABLE project_data (
            id SERIAL PRIMARY KEY,
            customer_name VARCHAR(255) NOT NULL,
            project TEXT NOT NULL,
            worked_date DATE NOT NULL,
            task_title TEXT NOT NULL,
            resource_name VARCHAR(255) NOT NULL,
            billable_hours DECIMAL(10,2) NOT NULL,
            hourly_rate DECIMAL(10,2) NOT NULL,
            revenue DECIMAL(12,2) NOT NULL,
            customer_category VARCHAR(255) NOT NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
        """
        cursor.execute(create_table_sql)
        logger.info("✓ Created project_data table")
        
        # Create optimized indexes
        indexes = [
            "CREATE INDEX idx_project_data_worked_date ON project_data(worked_date)",
            "CREATE INDEX idx_project_data_customer_name ON project_data(customer_name)",
            "CREATE INDEX idx_project_data_project ON project_data(project)",
            "CREATE INDEX idx_project_data_customer_category ON project_data(customer_category)",
            "CREATE INDEX idx_project_data_composite_filter ON project_data(worked_date, customer_name, project)",
            "CREATE INDEX idx_project_data_revenue ON project_data(revenue)",
            "CREATE INDEX idx_project_data_monthly ON project_data(EXTRACT(MONTH FROM worked_date))"
        ]
        
        for index_sql in indexes:
            cursor.execute(index_sql)
            logger.info(f"✓ Created index: {index_sql.split('CREATE INDEX ')[1].split(' ON')[0]}")
        
        # Create materialized view for faster aggregations
        materialized_view_sql = """
        CREATE MATERIALIZED VIEW monthly_aggregates AS
        SELECT 
            EXTRACT(YEAR FROM worked_date) as year,
            EXTRACT(MONTH FROM worked_date) as month,
            customer_name,
            project,
            customer_category,
            SUM(revenue) as total_revenue,
            SUM(billable_hours) as total_hours,
            COUNT(*) as record_count,
            AVG(hourly_rate) as avg_hourly_rate
        FROM project_data
        GROUP BY 
            EXTRACT(YEAR FROM worked_date),
            EXTRACT(MONTH FROM worked_date),
            customer_name,
            project,
            customer_category
        """
        cursor.execute(materialized_view_sql)
        logger.info("✓ Created materialized view: monthly_aggregates")
        
        # Create index on materialized view
        cursor.execute("CREATE INDEX idx_monthly_aggregates_lookup ON monthly_aggregates(year, month, customer_name)")
        logger.info("✓ Created index on materialized view")
        
        cursor.close()
        conn.close()
        logger.info("Schema creation completed!")
        
    except Exception as e:
        logger.error(f"Error creating schema: {e}")
        raise

def load_csv_data():
    """Load CSV data into PostgreSQL with batch processing"""
    try:
        if not os.path.exists(CSV_FILE_PATH):
            logger.error(f"CSV file not found: {CSV_FILE_PATH}")
            return False
        
        logger.info(f"Loading CSV data from: {CSV_FILE_PATH}")
        
        # Read CSV with pandas
        logger.info("Reading CSV file...")
        df = pd.read_csv(CSV_FILE_PATH)
        logger.info(f"✓ Loaded {len(df)} rows from CSV")
        
        # Clean and prepare data
        logger.info("Cleaning and preparing data...")
        
        # Remove the first column if it's an index
        if 'Unnamed: 0' in df.columns:
            df = df.drop('Unnamed: 0', axis=1)
        
        # Rename columns to match database schema
        column_mapping = {
            'Customer Name': 'customer_name',
            'Project': 'project', 
            'Worked Date': 'worked_date',
            'Task or Ticket Title': 'task_title',
            'Resource Name': 'resource_name',
            'Billable Hours': 'billable_hours',
            'Hourly Billing Rate': 'hourly_rate',
            'Extended Price': 'revenue',
            'Detailed Customer Category': 'customer_category'
        }
        
        df = df.rename(columns=column_mapping)
        
        # Convert dates
        df['worked_date'] = pd.to_datetime(df['worked_date']).dt.date
        
        # Convert numeric columns
        df['billable_hours'] = pd.to_numeric(df['billable_hours'], errors='coerce')
        df['hourly_rate'] = pd.to_numeric(df['hourly_rate'], errors='coerce')
        df['revenue'] = pd.to_numeric(df['revenue'], errors='coerce')
        
        # Remove any rows with null values in critical columns
        initial_count = len(df)
        df = df.dropna(subset=['customer_name', 'project', 'worked_date', 'billable_hours', 'revenue'])
        final_count = len(df)
        
        if initial_count != final_count:
            logger.warning(f"Removed {initial_count - final_count} rows with missing data")
        
        logger.info(f"✓ Data cleaned. Final count: {final_count} rows")
        
        # Insert data in batches
        conn = get_db_connection()
        cursor = conn.cursor()
        
        insert_sql = """
        INSERT INTO project_data (
            customer_name, project, worked_date, task_title, resource_name,
            billable_hours, hourly_rate, revenue, customer_category
        ) VALUES %s
        """
        
        # Convert DataFrame to list of tuples for batch insert
        data_tuples = [tuple(row) for row in df.to_numpy()]
        
        logger.info("Inserting data into database...")
        start_time = time.time()
        
        # Use execute_values for better performance
        execute_values(
            cursor, 
            insert_sql, 
            data_tuples,
            template=None,
            page_size=1000
        )
        
        insert_time = time.time() - start_time
        logger.info(f"✓ Data inserted successfully in {insert_time:.2f} seconds")
        
        # Refresh materialized view
        logger.info("Refreshing materialized view...")
        cursor.execute("REFRESH MATERIALIZED VIEW monthly_aggregates")
        logger.info("✓ Materialized view refreshed")
        
        # Get final statistics
        cursor.execute("SELECT COUNT(*) FROM project_data")
        total_records = cursor.fetchone()[0]
        
        cursor.execute("SELECT MIN(worked_date), MAX(worked_date) FROM project_data")
        date_range = cursor.fetchone()
        
        cursor.execute("SELECT COUNT(DISTINCT customer_name) FROM project_data")
        unique_customers = cursor.fetchone()[0]
        
        cursor.execute("SELECT COUNT(DISTINCT project) FROM project_data")
        unique_projects = cursor.fetchone()[0]
        
        logger.info(f"✓ Migration completed successfully!")
        logger.info(f"  Total records: {total_records:,}")
        logger.info(f"  Date range: {date_range[0]} to {date_range[1]}")
        logger.info(f"  Unique customers: {unique_customers}")
        logger.info(f"  Unique projects: {unique_projects}")
        
        cursor.close()
        conn.close()
        return True
        
    except Exception as e:
        logger.error(f"Error loading CSV data: {e}")
        return False

def run_performance_test():
    """Run performance tests on the database"""
    try:
        logger.info("Running performance tests...")
        conn = get_db_connection()
        cursor = conn.cursor()
        
        # Test 1: Monthly aggregation (seasonal analysis)
        start_time = time.time()
        cursor.execute("""
            SELECT 
                EXTRACT(MONTH FROM worked_date) as month,
                SUM(revenue) as total_revenue,
                SUM(billable_hours) as total_hours,
                COUNT(DISTINCT project) as project_count
            FROM project_data 
            GROUP BY EXTRACT(MONTH FROM worked_date)
            ORDER BY month
        """)
        results = cursor.fetchall()
        test1_time = (time.time() - start_time) * 1000
        
        # Test 2: Customer filtering
        start_time = time.time()
        cursor.execute("""
            SELECT customer_name, SUM(revenue) as total_revenue
            FROM project_data 
            WHERE customer_name IN ('State Transportation', 'Macroservice')
            GROUP BY customer_name
        """)
        results = cursor.fetchall()
        test2_time = (time.time() - start_time) * 1000
        
        # Test 3: Date range filtering
        start_time = time.time()
        cursor.execute("""
            SELECT 
                TO_CHAR(worked_date, 'YYYY-MM') as month,
                SUM(revenue) as revenue
            FROM project_data 
            WHERE worked_date BETWEEN '2024-01-01' AND '2024-06-30'
            GROUP BY TO_CHAR(worked_date, 'YYYY-MM')
            ORDER BY month
        """)
        results = cursor.fetchall()
        test3_time = (time.time() - start_time) * 1000
        
        logger.info("Performance test results:")
        logger.info(f"  Monthly aggregation: {test1_time:.1f}ms")
        logger.info(f"  Customer filtering: {test2_time:.1f}ms") 
        logger.info(f"  Date range filtering: {test3_time:.1f}ms")
        
        cursor.close()
        conn.close()
        
    except Exception as e:
        logger.error(f"Error running performance tests: {e}")

def main():
    """Main migration function"""
    try:
        logger.info("🚀 Starting Flask/PostgreSQL Migration")
        logger.info("=" * 50)
        
        # Check if CSV file exists
        if not os.path.exists(CSV_FILE_PATH):
            logger.error(f"CSV file not found: {CSV_FILE_PATH}")
            logger.error("Please ensure the CSV file is in the correct location")
            return False
        
        # Step 1: Create database
        create_database_if_not_exists()
        
        # Step 2: Create schema
        create_schema()
        
        # Step 3: Load data
        success = load_csv_data()
        
        if success:
            # Step 4: Run performance tests
            run_performance_test()
            
            logger.info("=" * 50)
            logger.info("🎉 Migration completed successfully!")
            logger.info("Next steps:")
            logger.info("1. Install Python dependencies: pip install flask flask-cors psycopg2-binary pandas")
            logger.info("2. Set environment variables (DB_HOST, DB_NAME, DB_USER, DB_PASSWORD)")
            logger.info("3. Run Flask server: python api/seasonal_analysis_flask.py")
            logger.info("4. Your dashboard will be lightning fast! ⚡")
            
            return True
        else:
            logger.error("Migration failed!")
            return False
            
    except Exception as e:
        logger.error(f"Migration failed: {e}")
        return False

if __name__ == "__main__":
    success = main()
    sys.exit(0 if success else 1) 