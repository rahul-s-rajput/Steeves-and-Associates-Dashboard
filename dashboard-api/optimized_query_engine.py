import asyncio
import logging
import json
import time
import uuid
from typing import Optional, Dict, Any
from event_loop_manager import run_async_in_flask
from gemini_client_manager import gemini_manager
from rag_manager import rag_manager
from performance_monitor import performance_monitor

logger = logging.getLogger(__name__)

class OptimizedQueryEngine:
    """High-performance query engine with advanced optimizations"""
    
    def __init__(self):
        # Load dataset summary for fallback responses
        self.dataset_summary = self._load_dataset_summary()
        
        # Query optimization settings
        self.enable_caching = True
        self.enable_fallback = True
        self.max_query_length = 2000
        
        # Simple in-memory cache for frequent queries
        self.query_cache = {}
        self.cache_expiry = {}
        self.cache_ttl = 3600  # 1 hour
        
    def _load_dataset_summary(self) -> Dict:
        """Load dataset summary for fallback responses"""
        try:
            with open('dataset_summary.json', 'r') as f:
                summary = json.load(f)
                logger.info("✅ Dataset summary loaded for fallback responses")
                return summary
        except Exception as e:
            logger.warning(f"⚠️ Could not load dataset summary: {e}")
            return {}
    
    def query_with_optimizations(self, query: str, mode: str = "mix") -> str:
        """Main query method with full optimization stack"""
        request_id = str(uuid.uuid4())[:8]
        start_time = performance_monitor.record_request_start(request_id, "optimized_query")
        
        try:
            # Input validation and preprocessing
            processed_query = self._preprocess_query(query)
            if not processed_query:
                return "Please provide a valid question."
            
            # Check cache first
            if self.enable_caching:
                cached_result = self._check_cache(processed_query, mode)
                if cached_result:
                    performance_monitor.record_cache_hit()
                    performance_monitor.record_request_end(request_id, "optimized_query", start_time, True)
                    logger.info(f"🎯 Cache hit for query: {processed_query[:50]}...")
                    return cached_result
                else:
                    performance_monitor.record_cache_miss()
            
            # Execute optimized query
            result = run_async_in_flask(self._execute_optimized_query(processed_query, mode))
            
            # Cache successful results
            if self.enable_caching and result and not result.startswith("I apologize"):
                self._cache_result(processed_query, mode, result)
            
            performance_monitor.record_request_end(request_id, "optimized_query", start_time, True)
            return result
            
        except Exception as e:
            logger.error(f"❌ Optimized query failed: {e}")
            performance_monitor.record_request_end(request_id, "optimized_query", start_time, False, str(type(e).__name__))
            
            # Fallback response
            if self.enable_fallback:
                return self._generate_fallback_response(query)
            else:
                return "I'm sorry, I'm experiencing technical difficulties. Please try again."
    
    async def _execute_optimized_query(self, query: str, mode: str) -> str:
        """Execute query using optimized RAG and Gemini pipeline, always including summary."""
        try:
            logger.info(f"🚀 Executing optimized query with unified context: {query[:50]}...")
            
            # Step 1: Always start with the dataset summary as the base context.
            if self.dataset_summary:
                full_context = f"Here is a summary of the overall business data for high-level context:\n{json.dumps(self.dataset_summary, indent=2)}\n\n---\n\n"
                logger.info("✅ Injecting dataset summary into the LLM context.")
            else:
                full_context = ""
                logger.warning("⚠️ Dataset summary not available. Starting with an empty context.")

            # Step 2: Get specific RAG context.
            rag_context = await self._get_rag_context(query, mode)
            
            # Step 3: Append RAG context if it was found.
            if rag_context and rag_context.strip():
                logger.info("✅ Injecting retrieved document context.")
                full_context += f"Here is the specific context retrieved from documents based on the user's query:\n{rag_context}"
            else:
                logger.info("ℹ️ No specific documents found. Answering from summary data only.")
                full_context += "No specific documents were retrieved for this query. Please answer based SOLELY on the overall business summary provided above if it is relevant."

            # Step 4: Generate the final response using the unified context.
            system_prompt = self._create_enhanced_system_prompt(mode)
            
            user_prompt = f"""Question: {query}

Context:
{full_context}

Based on all the provided context, please provide a detailed and well-structured answer to the question."""

            response = await gemini_manager.generate_content_async(
                prompt=user_prompt,
                system_prompt=system_prompt,
                temperature=0.2
            )
            
            return response
            
        except Exception as e:
            logger.error(f"❌ Optimized query execution failed: {e}")
            raise
    
    async def _get_rag_context(self, query: str, mode: str) -> str:
        """Get RAG context with optimization based on mode"""
        try:
            logger.info(f"🔍 Retrieving RAG context (mode: {mode})")
            
            # Use optimized RAG manager
            rag_response = await rag_manager.enhanced_query(query, mode)
            
            if rag_response and len(rag_response.strip()) > 10:
                logger.info("✅ RAG context retrieved successfully")
                return rag_response
            else:
                logger.warning("⚠️ RAG returned minimal context")
                return ""
                
        except Exception as e:
            logger.error(f"❌ RAG context retrieval failed: {e}")
            return ""
    
    def _create_enhanced_system_prompt(self, mode: str) -> str:
        """Create optimized system prompt based on mode"""
        base_prompt = """You are a highly knowledgeable business intelligence analyst. Your purpose is to provide clear,
comprehensive, and actionable insights based on the provided context. Answer the user's question thoroughly,
synthesizing all relevant information from the context. You have access to a general summary of the entire dataset and, in some cases, specific information retrieved based on the user's query. Use both to formulate your answer.
Structure your answer logically with clear headings,
bullet points, and bold text to improve readability. Do not mention the context in your answer."""
        
        if mode == "fast":
            return base_prompt + " Provide a concise but complete answer. Focus on the most important insights."
        elif mode == "enhanced":
            return base_prompt + " Provide a detailed, comprehensive analysis with multiple perspectives and actionable recommendations."
        else:
            return base_prompt + " Structure your answer logically with clear headings, bullet points, and bold text to improve readability."
    
    def _create_user_prompt(self, query: str, rag_context: str) -> str:
        """Create optimized user prompt with RAG context"""
        # This method is no longer directly called in the main flow but is kept for potential future use
        # or testing. The prompt is now constructed directly in _execute_optimized_query.
        return f"""Question: {query}

Context:
{rag_context}

Please provide a comprehensive answer based on the provided context."""
    
    def _preprocess_query(self, query: str) -> str:
        """Preprocess and validate query"""
        if not query or not isinstance(query, str):
            return ""
        
        # Clean and truncate query
        cleaned_query = query.strip()
        if len(cleaned_query) > self.max_query_length:
            cleaned_query = cleaned_query[:self.max_query_length] + "..."
        
        return cleaned_query
    
    def _check_cache(self, query: str, mode: str) -> Optional[str]:
        """Check if query result is cached and still valid"""
        cache_key = f"{query}_{mode}"
        
        if cache_key in self.query_cache:
            # Check if cache entry is still valid
            if time.time() < self.cache_expiry.get(cache_key, 0):
                return self.query_cache[cache_key]
            else:
                # Remove expired entry
                self.query_cache.pop(cache_key, None)
                self.cache_expiry.pop(cache_key, None)
        
        return None
    
    def _cache_result(self, query: str, mode: str, result: str):
        """Cache query result with expiry"""
        cache_key = f"{query}_{mode}"
        
        # Limit cache size (simple LRU-like behavior)
        if len(self.query_cache) >= 100:
            # Remove oldest entry
            oldest_key = min(self.cache_expiry.keys(), key=lambda k: self.cache_expiry[k])
            self.query_cache.pop(oldest_key, None)
            self.cache_expiry.pop(oldest_key, None)
        
        self.query_cache[cache_key] = result
        self.cache_expiry[cache_key] = time.time() + self.cache_ttl
    
    def _generate_fallback_response(self, query: str) -> str:
        """Generate fallback response when all else fails"""
        logger.info("🛡️ Generating fallback response")
        
        if "revenue" in query.lower():
            return "Based on our business data, we track revenue across multiple dimensions including customer categories, projects, and time periods. For specific revenue analysis, please try rephrasing your question or contact support."
        elif "customer" in query.lower():
            return "Our customer analysis includes performance metrics across different sectors including Education, Commercial/Corporate, Government/Municipality, and Health & Community Services. Please try a more specific question about customer performance."
        elif "project" in query.lower():
            return "We analyze project performance including revenue, duration, and resource allocation. For detailed project insights, please specify which aspects you're interested in."
        else:
            return "I'm currently experiencing technical difficulties accessing the full knowledge base. Please try rephrasing your question or contact support for assistance."
    
    def clear_cache(self):
        """Clear the query cache"""
        self.query_cache.clear()
        self.cache_expiry.clear()
        logger.info("🗑️ Query cache cleared")
    
    def get_cache_stats(self) -> Dict:
        """Get cache statistics"""
        current_time = time.time()
        valid_entries = sum(1 for expiry in self.cache_expiry.values() if expiry > current_time)
        
        return {
            "total_entries": len(self.query_cache),
            "valid_entries": valid_entries,
            "expired_entries": len(self.query_cache) - valid_entries,
            "cache_size_bytes": sum(len(str(v)) for v in self.query_cache.values()),
            "ttl_seconds": self.cache_ttl
        }

# Global instance
optimized_query_engine = OptimizedQueryEngine() 