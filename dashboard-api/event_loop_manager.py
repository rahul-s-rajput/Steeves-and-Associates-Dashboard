import asyncio
import threading
from typing import Optional
import logging
import time

logger = logging.getLogger(__name__)

class FlaskAsyncManager:
    """Manages a single event loop for Flask async operations"""
    
    _instance: Optional['FlaskAsyncManager'] = None
    _loop: Optional[asyncio.AbstractEventLoop] = None
    _thread: Optional[threading.Thread] = None
    _shutdown = False
    
    def __new__(cls):
        if cls._instance is None:
            cls._instance = super().__new__(cls)
        return cls._instance
    
    def __init__(self):
        if self._loop is None:
            self._start_event_loop()
    
    def _start_event_loop(self):
        """Start event loop in background thread"""
        def run_loop():
            self._loop = asyncio.new_event_loop()
            asyncio.set_event_loop(self._loop)
            try:
                logger.info("Starting Flask async event loop")
                self._loop.run_forever()
            except Exception as e:
                logger.error(f"Event loop error: {e}")
            finally:
                logger.info("Event loop closing")
                self._loop.close()
        
        self._thread = threading.Thread(target=run_loop, daemon=True, name="FlaskAsyncLoop")
        self._thread.start()
        
        # Wait for loop to be ready
        start_time = time.time()
        while self._loop is None and (time.time() - start_time) < 10:  # 10 second timeout
            time.sleep(0.01)
        
        if self._loop is None:
            raise RuntimeError("Failed to start event loop within timeout")
        
        logger.info("Flask async event loop started successfully")
    
    def run_async(self, coro):
        """Run coroutine in managed event loop"""
        if self._shutdown:
            raise RuntimeError("Event loop manager is shutdown")
        
        if self._loop is None or self._loop.is_closed():
            logger.warning("Event loop not available, restarting...")
            self._start_event_loop()
        
        try:
            # Run the coroutine in the background event loop
            future = asyncio.run_coroutine_threadsafe(coro, self._loop)
            result = future.result(timeout=300)  # 5 minute timeout
            return result
        
        except asyncio.TimeoutError as e:
            logger.error("Async operation timed out after 5 minutes")
            raise RuntimeError("Operation timed out") from e
        
        except Exception as e:
            logger.error(f"Async operation failed: {e}")
            raise
    
    def is_healthy(self) -> bool:
        """Check if the event loop is healthy"""
        return (
            not self._shutdown and 
            self._loop is not None and 
            not self._loop.is_closed() and 
            self._thread is not None and 
            self._thread.is_alive()
        )
    
    def get_status(self) -> dict:
        """Get detailed status information"""
        return {
            "shutdown": self._shutdown,
            "loop_exists": self._loop is not None,
            "loop_closed": self._loop.is_closed() if self._loop else None,
            "thread_alive": self._thread.is_alive() if self._thread else None,
            "thread_name": self._thread.name if self._thread else None,
            "healthy": self.is_healthy()
        }
    
    def shutdown(self):
        """Graceful shutdown"""
        logger.info("Initiating Flask async manager shutdown")
        self._shutdown = True
        
        if self._loop and not self._loop.is_closed():
            try:
                # Schedule the loop to stop
                self._loop.call_soon_threadsafe(self._loop.stop)
            except RuntimeError as e:
                logger.warning(f"Error stopping event loop: {e}")
        
        if self._thread:
            self._thread.join(timeout=5)
            if self._thread.is_alive():
                logger.warning("Event loop thread did not shutdown cleanly")
            else:
                logger.info("Event loop thread shutdown successfully")

# Global instance - this will be the single event loop manager for the entire Flask app
async_manager = FlaskAsyncManager()

# Convenience function for direct use
def run_async_in_flask(coro):
    """Convenience function to run async code in Flask routes"""
    return async_manager.run_async(coro) 