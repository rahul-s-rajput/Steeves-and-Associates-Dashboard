import asyncio
import os
import logging
from typing import Optional
import google.generativeai as genai
import threading
import time
from dotenv import load_dotenv

# Load environment variables
load_dotenv()

logger = logging.getLogger(__name__)

class GeminiClientManager:
    """Manages Gemini client lifecycle with proper async context"""
    
    _instance: Optional['GeminiClientManager'] = None
    _client = None
    _lock = threading.Lock()
    _initialized = False
    _last_test_time = 0
    _test_interval = 300  # Test every 5 minutes
    
    def __new__(cls):
        if cls._instance is None:
            cls._instance = super().__new__(cls)
        return cls._instance
    
    def __init__(self):
        self.api_key = os.environ.get("GOOGLE_API_KEY")
        if not self.api_key:
            logger.warning("GOOGLE_API_KEY environment variable not set")
        
        # Connection settings
        self.max_retries = int(os.environ.get("GEMINI_MAX_RETRIES", "3"))
        self.timeout = int(os.environ.get("GEMINI_TIMEOUT", "30"))
        self.model_name = os.environ.get("GEMINI_MODEL", "gemini-2.0-flash-exp")
    
    async def get_configured_client(self):
        """Get or create properly configured Gemini client"""
        current_time = time.time()
        
        # Check if we need to reinitialize
        if (not self._initialized or 
            self._client is None or 
            (current_time - self._last_test_time) > self._test_interval):
            
            with self._lock:
                # Double-check after acquiring lock
                if (not self._initialized or 
                    self._client is None or 
                    (current_time - self._last_test_time) > self._test_interval):
                    await self._initialize_client()
        
        return self._client
    
    async def _initialize_client(self):
        """Initialize Gemini client in current event loop"""
        try:
            if not self.api_key:
                raise ValueError("GOOGLE_API_KEY not configured")
            
            logger.info("Initializing Gemini client...")
            
            # Configure genai with API key
            genai.configure(api_key=self.api_key)
            
            # Store the configured state (genai is globally configured)
            self._client = genai
            
            # Test the client
            await self._test_client()
            
            self._initialized = True
            self._last_test_time = time.time()
            logger.info("✅ Gemini client initialized successfully")
            
        except Exception as e:
            logger.error(f"❌ Failed to initialize Gemini client: {e}")
            self._client = None
            self._initialized = False
            raise
    
    async def _test_client(self):
        """Test client connectivity with minimal call"""
        try:
            model = genai.GenerativeModel(self.model_name)
            
            # Minimal test prompt
            response = await asyncio.wait_for(
                model.generate_content_async("Test"),
                timeout=self.timeout
            )
            
            if response and response.text:
                logger.info("✅ Gemini client test successful")
            else:
                logger.warning("⚠️ Gemini client test returned empty response")
                
        except asyncio.TimeoutError:
            logger.error("❌ Gemini client test timed out")
            raise
        except Exception as e:
            logger.error(f"❌ Gemini client test failed: {e}")
            raise
    
    async def generate_content_async(self, prompt: str, system_prompt: str = None, temperature: float = 0.2):
        """Generate content with proper error handling and retries"""
        client = await self.get_configured_client()
        
        for attempt in range(self.max_retries):
            try:
                model = genai.GenerativeModel(
                    model_name=self.model_name,
                    system_instruction=system_prompt if system_prompt else None
                )
                
                generation_config = genai.types.GenerationConfig(
                    temperature=temperature,
                    max_output_tokens=8192,
                    top_p=0.8,
                    top_k=40
                )
                
                logger.info(f"🤖 Generating content with Gemini (attempt {attempt + 1}/{self.max_retries})")
                
                response = await asyncio.wait_for(
                    model.generate_content_async(
                        prompt,
                        generation_config=generation_config
                    ),
                    timeout=self.timeout
                )
                
                if response and response.text:
                    logger.info("✅ Gemini content generation successful")
                    return response.text
                else:
                    logger.warning("⚠️ Gemini returned empty response")
                    return "I apologize, but I couldn't generate a response. Please try again."
                    
            except asyncio.TimeoutError:
                logger.error(f"⏰ Gemini request timed out (attempt {attempt + 1})")
                if attempt == self.max_retries - 1:
                    return "The request timed out. Please try again with a simpler question."
                    
            except Exception as e:
                logger.error(f"❌ Gemini generation error (attempt {attempt + 1}): {e}")
                
                # Auto-recovery attempt
                if attempt == self.max_retries - 1:
                    try:
                        await self.reset_client()
                        return "I'm experiencing technical difficulties. Please try again."
                    except:
                        return "Service temporarily unavailable. Please try again later."
                
                # Wait before retry
                await asyncio.sleep(2 ** attempt)  # Exponential backoff
        
        return "Unable to process your request after multiple attempts. Please try again later."
    
    async def reset_client(self):
        """Force client reset for recovery"""
        logger.info("🔄 Resetting Gemini client...")
        with self._lock:
            self._client = None
            self._initialized = False
            self._last_test_time = 0
            
        # Reinitialize
        try:
            await self._initialize_client()
            logger.info("✅ Gemini client reset successful")
        except Exception as e:
            logger.error(f"❌ Gemini client reset failed: {e}")
            raise
    
    def get_status(self) -> dict:
        """Get client status information"""
        return {
            "initialized": self._initialized,
            "client_exists": self._client is not None,
            "last_test_time": self._last_test_time,
            "api_key_configured": bool(self.api_key),
            "model_name": self.model_name,
            "max_retries": self.max_retries,
            "timeout": self.timeout
        }

# Global instance
gemini_manager = GeminiClientManager() 