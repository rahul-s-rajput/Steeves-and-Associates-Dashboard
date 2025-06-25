-- Project Data Table with Optimized Indexes
CREATE TABLE project_data (
    id SERIAL PRIMARY KEY,
    customer_name VARCHAR(255) NOT NULL,
    project VARCHAR(255) NOT NULL,
    worked_date DATE NOT NULL,
    task_title TEXT,
    resource_name VARCHAR(255) NOT NULL,
    billable_hours DECIMAL(8,2) NOT NULL,
    hourly_rate DECIMAL(8,2) NOT NULL,
    extended_price DECIMAL(10,2) NOT NULL,
    customer_category VARCHAR(255) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Indexes for Fast Filtering & Aggregation
CREATE INDEX idx_worked_date ON project_data(worked_date);
CREATE INDEX idx_customer_name ON project_data(customer_name);
CREATE INDEX idx_project ON project_data(project);
CREATE INDEX idx_customer_category ON project_data(customer_category);
CREATE INDEX idx_resource_name ON project_data(resource_name);

-- Composite indexes for common filter combinations
CREATE INDEX idx_date_customer ON project_data(worked_date, customer_name);
CREATE INDEX idx_date_project ON project_data(worked_date, project);
CREATE INDEX idx_date_category ON project_data(worked_date, customer_category);
CREATE INDEX idx_customer_project ON project_data(customer_name, project);

-- Partial index for recent data (if most queries are for recent data)
CREATE INDEX idx_recent_data ON project_data(worked_date, extended_price) 
WHERE worked_date >= CURRENT_DATE - INTERVAL '2 years';

-- View for common aggregations (optional - can improve performance further)
CREATE MATERIALIZED VIEW monthly_revenue_summary AS
SELECT 
    DATE_TRUNC('month', worked_date) as month_start,
    EXTRACT(MONTH FROM worked_date) as month_num,
    TO_CHAR(worked_date, 'Mon') as month_short,
    TO_CHAR(worked_date, 'Month') as month_full,
    customer_name,
    customer_category,
    project,
    COUNT(*) as record_count,
    SUM(extended_price) as total_revenue,
    SUM(billable_hours) as total_hours,
    AVG(hourly_rate) as avg_hourly_rate,
    COUNT(DISTINCT resource_name) as resource_count
FROM project_data
GROUP BY 
    DATE_TRUNC('month', worked_date),
    EXTRACT(MONTH FROM worked_date),
    TO_CHAR(worked_date, 'Mon'),
    TO_CHAR(worked_date, 'Month'),
    customer_name,
    customer_category,
    project;

-- Index on materialized view
CREATE INDEX idx_monthly_summary_month ON monthly_revenue_summary(month_start);
CREATE INDEX idx_monthly_summary_customer ON monthly_revenue_summary(customer_name);
CREATE INDEX idx_monthly_summary_project ON monthly_revenue_summary(project);

-- Function to refresh materialized view (call this when data changes)
CREATE OR REPLACE FUNCTION refresh_monthly_summary()
RETURNS void AS $$
BEGIN
    REFRESH MATERIALIZED VIEW CONCURRENTLY monthly_revenue_summary;
END;
$$ LANGUAGE plpgsql; 