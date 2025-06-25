import os
import google.generativeai as genai
from lightrag.utils import EmbeddingFunc
import asyncio
import time
from collections import deque
import logging
from typing import List
from mistralai import Mistral

# Configure logging using Python's standard library
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

# Define a rate limiter decorator
def async_rate_limiter(max_calls: int, period: int):
    """
    Decorator that limits an async function to a certain number of calls per period.
    """
    lock = asyncio.Lock()
    calls = deque()

    def decorator(func):
        async def wrapper(*args, **kwargs):
            async with lock:
                current_time = time.monotonic()
                
                # Remove timestamps older than the period
                while calls and calls[0] <= current_time - period:
                    calls.popleft()
                
                # If we have made too many calls, wait for the oldest call to be out of the window
                if len(calls) >= max_calls:
                    sleep_duration = (calls[0] + period) - current_time
                    if sleep_duration > 0:
                        await asyncio.sleep(sleep_duration)
                
                calls.append(time.monotonic())
            
            return await func(*args, **kwargs)
        return wrapper
    return decorator


# --- Gemini API Configuration ---
# IMPORTANT: Set your Google API Key in your environment variables.
# For example, in your shell: export GOOGLE_API_KEY="your_api_key"
try:
    api_key = os.environ["GOOGLE_API_KEY"]
    genai.configure(api_key=api_key)
    logger.info("✅ Successfully configured Gemini with API key.")
except KeyError:
    logger.error("❌ GOOGLE_API_KEY environment variable not set.")
    raise ValueError("API key for Gemini is missing. Please set the GOOGLE_API_KEY environment variable.")
except Exception as e:
    logger.error(f"An unexpected error occurred during Gemini configuration: {e}")
    raise

# Define model and embedding settings
LLM_MODEL = "gemini-2.0-flash"
EMBEDDING_MODEL = "text-embedding-004"
EMBEDDING_DIM = 768
MAX_TOKEN_SIZE = 8192

# Configure Mistral API
mistral_client = Mistral(api_key=os.getenv("MISTRAL_API_KEY"))

# Rate limiting for Mistral API (1 request per second)
class MistralRateLimiter:
    def __init__(self, requests_per_second: float = 1.0):
        self.min_interval = 1.0 / requests_per_second
        self.last_request_time = 0
    
    async def wait_if_needed(self):
        current_time = time.time()
        time_since_last = current_time - self.last_request_time
        if time_since_last < self.min_interval:
            wait_time = self.min_interval - time_since_last
            await asyncio.sleep(wait_time)
        self.last_request_time = time.time()

# Global rate limiter instance
mistral_rate_limiter = MistralRateLimiter(requests_per_second=1.0)

# --- 2. Create Wrapper Functions for LightRAG Injection ---

# 1. LLM Function for generation, now with rate limiting
@async_rate_limiter(max_calls=30, period=60)
async def gemini_llm_func(prompt: str, **kwargs) -> str:
    """
    An async function that uses the Gemini API to generate content from a prompt.
    This function is rate-limited to 30 calls per 60 seconds.
    """
    try:
        model = genai.GenerativeModel(LLM_MODEL)
        response = await model.generate_content_async(prompt)
        return response.text
    except Exception as e:
        logger.error(f"Gemini LLM call failed: {e}")
        # Return an empty string or raise a specific exception
        return ""

async def gemini_embedding_func(texts: list[str]) -> list[list[float]]:
    """Wrapper for the Gemini embedding model."""
    # Note: Gemini embedding API uses 'text-embedding-004'
    result = await genai.embed_content_async(
        model="models/text-embedding-004",
        content=texts,
        task_type="RETRIEVAL_DOCUMENT" # Use 'RETRIEVAL_QUERY' for queries
    )
    return result['embedding']

# --- 3. Define the Embedding Function with its properties ---
# LightRAG needs to know the model's dimensions and token limits.
# Gemini's 'text-embedding-004' has 768 dimensions.
gemini_embedding_wrapper = EmbeddingFunc(
    embedding_dim=768, 
    max_token_size=8192, # Gemini supports a large context
    func=gemini_embedding_func
)

# Mistral LLM function for knowledge graph operations (with rate limiting)
async def mistral_llm_func(
    prompt: str, 
    system_prompt: str = None, 
    history_messages: List = None, 
    **kwargs
) -> str:
    """
    Mistral Small Latest LLM function for knowledge graph operations.
    Includes rate limiting to respect API limits.
    """
    try:
        # Apply rate limiting
        await mistral_rate_limiter.wait_if_needed()
        
        # Prepare messages
        messages = []
        
        if system_prompt:
            messages.append({"role": "system", "content": system_prompt})
        
        if history_messages:
            messages.extend(history_messages)
        
        messages.append({"role": "user", "content": prompt})
        
        # Make the API call
        response = await mistral_client.chat.complete_async(
            model="mistral-small-latest",
            messages=messages,
            max_tokens=kwargs.get("max_tokens", 4000),
            temperature=kwargs.get("temperature", 0.1)
        )
        
        return response.choices[0].message.content
        
    except Exception as e:
        print(f"Error in Mistral LLM call: {e}")
        return f"Error: {str(e)}"

# Gemini 2.0 Flash Lite function for chatbot operations
async def gemini_chatbot_func(
    prompt: str, 
    system_prompt: str = None, 
    history_messages: List = None, 
    **kwargs
) -> str:
    """
    Gemini 2.0 Flash Lite function for chatbot operations.
    Optimized for fast responses in chat scenarios.
    """
    try:
        # Use Gemini 2.0 Flash Lite model
        model = genai.GenerativeModel('gemini-2.0-flash-lite')
        
        # Prepare the full prompt
        full_prompt = ""
        if system_prompt:
            full_prompt += f"System: {system_prompt}\n\n"
        
        if history_messages:
            for msg in history_messages:
                role = msg.get("role", "user")
                content = msg.get("content", "")
                full_prompt += f"{role.capitalize()}: {content}\n"
        
        full_prompt += f"User: {prompt}\nAssistant:"
        
        # Generate response
        response = await model.generate_content_async(
            full_prompt,
            generation_config=genai.types.GenerationConfig(
                max_output_tokens=kwargs.get("max_tokens", 2000),
                temperature=kwargs.get("temperature", 0.7)
            )
        )
        
        return response.text
        
    except Exception as e:
        print(f"Error in Gemini chatbot call: {e}")
        return f"Error: {str(e)}"

# Export the functions for different use cases
# Use mistral_llm_func for knowledge graph operations (entity extraction, relationship building)
# Use gemini_chatbot_func for chatbot responses 