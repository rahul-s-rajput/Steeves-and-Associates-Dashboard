import time
import threading
import logging
import asyncio
from collections import defaultdict, deque
from typing import Dict, Optional, List
import json
import os

logger = logging.getLogger(__name__)

class PerformanceMonitor:
    """Performance monitoring and metrics collection"""
    
    def __init__(self):
        self._lock = threading.Lock()
        
        # Metrics storage
        self.response_times = deque(maxlen=1000)  # Last 1000 requests
        self.request_counts = defaultdict(int)
        self.error_counts = defaultdict(int)
        self.cache_stats = {"hits": 0, "misses": 0, "total": 0}
        
        # Performance tracking
        self.start_time = time.time()
        self.total_requests = 0
        self.total_errors = 0
        
        # Real-time metrics (last 5 minutes)
        self.recent_metrics = deque(maxlen=300)  # 5 min * 60 sec = 300 data points
        
        # Alert thresholds
        self.slow_request_threshold = float(os.environ.get("SLOW_REQUEST_THRESHOLD", "30.0"))
        self.error_rate_threshold = float(os.environ.get("ERROR_RATE_THRESHOLD", "0.1"))  # 10%
        
    def record_request_start(self, request_id: str, endpoint: str) -> float:
        """Record the start of a request"""
        start_time = time.time()
        
        with self._lock:
            self.total_requests += 1
            self.request_counts[endpoint] += 1
            
        logger.info(f"📊 Request {request_id} started on {endpoint}")
        return start_time
    
    def record_request_end(self, request_id: str, endpoint: str, start_time: float, 
                          success: bool = True, error_type: str = None):
        """Record the completion of a request"""
        end_time = time.time()
        response_time = end_time - start_time
        
        with self._lock:
            self.response_times.append(response_time)
            
            if not success:
                self.total_errors += 1
                self.error_counts[error_type or "unknown"] += 1
            
            # Add to recent metrics
            self.recent_metrics.append({
                "timestamp": end_time,
                "endpoint": endpoint,
                "response_time": response_time,
                "success": success,
                "error_type": error_type
            })
        
        # Log performance
        status = "✅" if success else "❌"
        if response_time > self.slow_request_threshold:
            logger.warning(f"🐌 {status} Slow request {request_id}: {response_time:.2f}s")
        else:
            logger.info(f"{status} Request {request_id} completed: {response_time:.2f}s")
        
        # Check for alerts
        self._check_performance_alerts()
    
    def record_cache_hit(self):
        """Record a cache hit"""
        with self._lock:
            self.cache_stats["hits"] += 1
            self.cache_stats["total"] += 1
    
    def record_cache_miss(self):
        """Record a cache miss"""
        with self._lock:
            self.cache_stats["misses"] += 1
            self.cache_stats["total"] += 1
    
    def get_current_stats(self) -> Dict:
        """Get current performance statistics"""
        with self._lock:
            current_time = time.time()
            uptime = current_time - self.start_time
            
            # Calculate averages
            avg_response_time = (
                sum(self.response_times) / len(self.response_times) 
                if self.response_times else 0
            )
            
            # Calculate recent metrics (last 5 minutes)
            recent_cutoff = current_time - 300  # 5 minutes ago
            recent_data = [m for m in self.recent_metrics if m["timestamp"] > recent_cutoff]
            
            recent_avg_response_time = (
                sum(m["response_time"] for m in recent_data) / len(recent_data)
                if recent_data else 0
            )
            
            recent_error_rate = (
                sum(1 for m in recent_data if not m["success"]) / len(recent_data)
                if recent_data else 0
            )
            
            # Cache hit rate
            cache_hit_rate = (
                self.cache_stats["hits"] / self.cache_stats["total"]
                if self.cache_stats["total"] > 0 else 0
            )
            
            return {
                "uptime_seconds": uptime,
                "total_requests": self.total_requests,
                "total_errors": self.total_errors,
                "overall_error_rate": self.total_errors / max(self.total_requests, 1),
                "avg_response_time": avg_response_time,
                "recent_avg_response_time": recent_avg_response_time,
                "recent_error_rate": recent_error_rate,
                "cache_hit_rate": cache_hit_rate,
                "cache_stats": self.cache_stats.copy(),
                "request_counts": dict(self.request_counts),
                "error_counts": dict(self.error_counts),
                "slow_requests": len([t for t in self.response_times if t > self.slow_request_threshold]),
                "performance_percentiles": self._calculate_percentiles()
            }
    
    def _calculate_percentiles(self) -> Dict:
        """Calculate response time percentiles"""
        if not self.response_times:
            return {}
        
        sorted_times = sorted(self.response_times)
        length = len(sorted_times)
        
        return {
            "p50": sorted_times[int(length * 0.5)],
            "p90": sorted_times[int(length * 0.9)],
            "p95": sorted_times[int(length * 0.95)],
            "p99": sorted_times[int(length * 0.99)]
        }
    
    def _check_performance_alerts(self):
        """Check for performance issues and log alerts"""
        stats = self.get_current_stats()
        
        # Check error rate
        if stats["recent_error_rate"] > self.error_rate_threshold:
            logger.warning(f"🚨 High error rate detected: {stats['recent_error_rate']:.2%}")
        
        # Check response time
        if stats["recent_avg_response_time"] > self.slow_request_threshold:
            logger.warning(f"🐌 High response time detected: {stats['recent_avg_response_time']:.2f}s")
        
        # Check cache performance
        if stats["cache_hit_rate"] < 0.7 and stats["cache_stats"]["total"] > 10:
            logger.warning(f"📉 Low cache hit rate: {stats['cache_hit_rate']:.2%}")
    
    def export_metrics(self, filepath: str = None) -> str:
        """Export metrics to JSON file"""
        if not filepath:
            filepath = f"performance_metrics_{int(time.time())}.json"
        
        stats = self.get_current_stats()
        
        try:
            with open(filepath, 'w') as f:
                json.dump(stats, f, indent=2)
            logger.info(f"📊 Metrics exported to {filepath}")
            return filepath
        except Exception as e:
            logger.error(f"❌ Failed to export metrics: {e}")
            return None
    
    def reset_metrics(self):
        """Reset all metrics (useful for testing)"""
        with self._lock:
            self.response_times.clear()
            self.request_counts.clear()
            self.error_counts.clear()
            self.cache_stats = {"hits": 0, "misses": 0, "total": 0}
            self.recent_metrics.clear()
            self.start_time = time.time()
            self.total_requests = 0
            self.total_errors = 0
        
        logger.info("🔄 Performance metrics reset")
    
    def get_health_status(self) -> Dict:
        """Get overall system health status"""
        stats = self.get_current_stats()
        
        # Determine health status
        health_score = 100
        issues = []
        
        # Check error rate
        if stats["recent_error_rate"] > self.error_rate_threshold:
            health_score -= 30
            issues.append(f"High error rate: {stats['recent_error_rate']:.2%}")
        
        # Check response time
        if stats["recent_avg_response_time"] > self.slow_request_threshold:
            health_score -= 25
            issues.append(f"Slow response time: {stats['recent_avg_response_time']:.2f}s")
        
        # Check cache performance
        if stats["cache_hit_rate"] < 0.5 and stats["cache_stats"]["total"] > 10:
            health_score -= 15
            issues.append(f"Low cache hit rate: {stats['cache_hit_rate']:.2%}")
        
        # Determine status
        if health_score >= 90:
            status = "excellent"
        elif health_score >= 70:
            status = "good"
        elif health_score >= 50:
            status = "fair"
        else:
            status = "poor"
        
        return {
            "status": status,
            "health_score": max(0, health_score),
            "issues": issues,
            "uptime": stats["uptime_seconds"],
            "total_requests": stats["total_requests"],
            "recent_avg_response_time": stats["recent_avg_response_time"],
            "recent_error_rate": stats["recent_error_rate"],
            "cache_hit_rate": stats["cache_hit_rate"]
        }

# Global instance
performance_monitor = PerformanceMonitor() 