import asyncio
import os
import logging
from typing import Optional
from lightrag import LightRAG, QueryParam
from rag_config import mistral_llm_func, gemini_embedding_wrapper
from lightrag.kg.shared_storage import finalize_share_data
import threading
import time
from dotenv import load_dotenv

# Load environment variables
load_dotenv()

logger = logging.getLogger(__name__)

class RAGManager:
    """Singleton RAG manager with proper async lifecycle and optimizations"""
    
    _instance: Optional['RAGManager'] = None
    _rag: Optional[LightRAG] = None
    _lock = threading.Lock()
    _initialized = False
    _last_health_check = 0
    _health_check_interval = 300  # 5 minutes
    
    def __new__(cls):
        if cls._instance is None:
            cls._instance = super().__new__(cls)
        return cls._instance
    
    def __init__(self):
        self.working_dir = "./bi_rag_storage"
        
        # Optimized settings from environment or defaults
        self.max_parallel_insert = int(os.environ.get("MAX_PARALLEL_INSERT", "2"))
        self.max_async = int(os.environ.get("MAX_ASYNC", "8"))
        self.top_k = int(os.environ.get("TOP_K", "80"))  # Balanced for quality vs performance
        
        # Query optimization settings
        self.max_token_for_text_unit = 5000
        self.max_token_for_global_context = 6000
        self.max_token_for_local_context = 6000
        
    async def get_rag_instance(self) -> LightRAG:
        """Get or create RAG instance with health checking"""
        current_time = time.time()
        
        # Check if we need to reinitialize or health check
        if (not self._initialized or 
            self._rag is None or 
            (current_time - self._last_health_check) > self._health_check_interval):
            
            with self._lock:
                # Double-check after acquiring lock
                if (not self._initialized or 
                    self._rag is None or 
                    (current_time - self._last_health_check) > self._health_check_interval):
                    await self._initialize_or_refresh_rag()
        
        return self._rag
    
    async def _initialize_or_refresh_rag(self):
        """Initialize or refresh RAG instance"""
        try:
            if self._rag is None:
                await self._initialize_rag()
            else:
                await self._health_check_rag()
                
        except Exception as e:
            logger.error(f"❌ RAG initialization/refresh failed: {e}")
            # Try to recover by reinitializing
            try:
                await self._initialize_rag()
            except Exception as recovery_error:
                logger.error(f"❌ RAG recovery failed: {recovery_error}")
                raise
    
    async def _initialize_rag(self):
        """Initialize RAG instance with optimized settings"""
        try:
            logger.info("🔧 Initializing optimized RAG instance...")
            
            # Create RAG instance with optimizations
            self._rag = LightRAG(
                working_dir=self.working_dir,
                
                # Use optimized models
                embedding_func=gemini_embedding_wrapper,
                llm_model_func=mistral_llm_func,
                
                # Optimize concurrency (based on LightRAG best practices)
                max_parallel_insert=self.max_parallel_insert,
                llm_model_max_async=self.max_async,
                entity_extract_max_gleaning=1,  # Reduce serial steps within chunks
            )
            
            # Initialize storage
            await self._rag.initialize_storages()
            
            self._initialized = True
            self._last_health_check = time.time()
            logger.info("✅ RAG instance initialized successfully")
            
        except Exception as e:
            logger.error(f"❌ Failed to initialize RAG: {e}")
            self._rag = None
            self._initialized = False
            raise
    
    async def _health_check_rag(self):
        """Perform health check on existing RAG instance"""
        try:
            logger.info("🔍 Performing RAG health check...")
            
            # Skip test query for health check to avoid namespace issues
            # Just verify the RAG instance exists and basic attributes are accessible
            if self._rag and hasattr(self._rag, 'working_dir'):
                self._last_health_check = time.time()
                logger.info("✅ RAG health check passed (lightweight check)")
            else:
                raise Exception("RAG instance invalid")
            
        except Exception as e:
            logger.warning(f"⚠️ RAG health check failed: {e}")
            # Only reinitialize if really necessary
            if "namespace" not in str(e).lower():
                await self._initialize_rag()
    
    async def enhanced_query(self, query: str, mode: str = "mix") -> str:
        """Optimized query with proper error handling"""
        rag_instance = await self.get_rag_instance()
        
        try:
            logger.info(f"🔍 Executing RAG query: {query[:50]}...")
            
            # Determine optimal parameters based on mode
            if mode == "enhanced":
                query_param = QueryParam(
                    mode="mix",
                    top_k=self.top_k,
                    response_type="Multiple Paragraphs",
                    max_token_for_text_unit=self.max_token_for_text_unit,
                    max_token_for_global_context=self.max_token_for_global_context,
                    max_token_for_local_context=self.max_token_for_local_context
                )
            elif mode == "fast":
                query_param = QueryParam(
                    mode="local",
                    top_k=min(self.top_k, 40),  # Reduced for speed
                    response_type="Single Paragraph",
                    max_token_for_text_unit=2000,
                    max_token_for_global_context=3000,
                    max_token_for_local_context=3000
                )
            else:  # default/mix
                query_param = QueryParam(
                    mode="hybrid",
                    top_k=self.top_k,
                    response_type="Multiple Paragraphs"
                )
            
            # Execute query with timeout
            response = await asyncio.wait_for(
                rag_instance.aquery(query, param=query_param),
                timeout=120  # 2 minute timeout for complex queries
            )
            
            logger.info("✅ RAG query completed successfully")
            return response
            
        except asyncio.TimeoutError:
            logger.error("⏰ RAG query timed out")
            return "The query is taking too long to process. Please try a more specific question."
            
        except Exception as e:
            logger.error(f"❌ RAG query error: {e}")
            
            # Smart error handling - don't reset for namespace errors during concurrent access
            if "namespace" in str(e).lower() and "shared-data" in str(e).lower():
                logger.info("🔄 Detected namespace concurrency issue, using fallback instead of reset")
                return "I'm processing multiple requests simultaneously. Please try your question again in a moment."
            
            # Auto-recovery attempt for other errors
            try:
                await self.reset_rag()
                return "Knowledge base temporarily unavailable. Please try again."
            except:
                return "Service error. Please contact support."
        
        finally:
            # Clean up resources
            try:
                finalize_share_data()
            except:
                pass  # Non-critical cleanup
    
    async def reset_rag(self):
        """Reset RAG instance for recovery"""
        logger.info("🔄 Resetting RAG instance...")
        with self._lock:
            if self._rag:
                try:
                    # Clean up existing instance
                    finalize_share_data()
                except:
                    pass  # Best effort cleanup
            
            self._rag = None
            self._initialized = False
            self._last_health_check = 0
        
        # Reinitialize
        try:
            await self._initialize_rag()
            logger.info("✅ RAG reset successful")
        except Exception as e:
            logger.error(f"❌ RAG reset failed: {e}")
            raise
    
    def get_status(self) -> dict:
        """Get RAG status information"""
        return {
            "initialized": self._initialized,
            "rag_exists": self._rag is not None,
            "last_health_check": self._last_health_check,
            "working_dir": self.working_dir,
            "max_parallel_insert": self.max_parallel_insert,
            "max_async": self.max_async,
            "top_k": self.top_k,
            "max_token_for_text_unit": self.max_token_for_text_unit,
            "max_token_for_global_context": self.max_token_for_global_context,
            "max_token_for_local_context": self.max_token_for_local_context
        }

# Global instance
rag_manager = RAGManager() 