import asyncio
import os
import json
from crawl4ai import AsyncWebCrawler
from lightrag import LightRAG
# Import the configuration we created in Phase 1
from rag_config import mistral_llm_func, gemini_embedding_wrapper
from lightrag.kg.shared_storage import initialize_pipeline_status

WORKING_DIR = "./bi_rag_storage" # Directory to store LightRAG data

def load_urls_from_file(file_path="pages.txt"):
    """Load URLs from a text file, cleaning up quotes and commas"""
    urls = []
    
    if not os.path.exists(file_path):
        print(f"❌ File {file_path} not found!")
        return urls
    
    with open(file_path, 'r', encoding='utf-8') as f:
        for line_num, line in enumerate(f, 1):
            line = line.strip()
            if not line:
                continue
                
            # Clean up the line - remove quotes and trailing commas
            url = line.strip('"').strip("'").rstrip(',').strip()
            
            if url.startswith('http'):
                urls.append(url)
                print(f"📖 Loaded URL {len(urls)}: {url}")
            else:
                print(f"⚠️ Skipping invalid URL on line {line_num}: {line}")
    
    print(f"✅ Loaded {len(urls)} URLs from {file_path}")
    return urls

async def check_existing_documents(rag, urls):
    """Check which URLs are already processed in the knowledge base"""
    existing_ids = set()
    new_urls = []
    
    print("🔍 Checking for already processed documents...")
    
    try:
        # Check multiple possible storage files for existing document IDs
        storage_files = [
            "kv_store_full_docs.json",
            "kv_store_doc_status.json"
        ]
        
        for storage_file in storage_files:
            storage_path = os.path.join(WORKING_DIR, storage_file)
            if os.path.exists(storage_path):
                print(f"📂 Reading existing document store: {storage_file}")
                
                with open(storage_path, 'r', encoding='utf-8') as f:
                    try:
                        storage_data = json.load(f)
                        
                        # Extract document IDs (keys in the storage)
                        if isinstance(storage_data, dict):
                            for doc_id in storage_data.keys():
                                # Document IDs in LightRAG are typically URLs
                                if doc_id.startswith('http'):
                                    existing_ids.add(doc_id)
                                    
                        print(f"   Found {len(existing_ids)} existing documents in {storage_file}")
                        break  # Use the first valid storage file we find
                        
                    except json.JSONDecodeError:
                        print(f"   ⚠️ Could not parse {storage_file}")
                        continue
        
        # Compare URLs against existing document IDs
        for url in urls:
            if url in existing_ids:
                print(f"⏭️ Skipping already processed: {url}")
            else:
                new_urls.append(url)
                
    except Exception as e:
        print(f"⚠️ Could not check existing documents: {e}")
        print("📋 Will process all URLs to be safe")
        new_urls = urls.copy()
    
    if existing_ids:
        print(f"\n📊 Document Status Summary:")
        print(f"   📚 Total URLs in pages.txt: {len(urls)}")
        print(f"   ✅ Already processed: {len(existing_ids)}")
        print(f"   🆕 New URLs to process: {len(new_urls)}")
        
        if len(new_urls) == 0:
            print("🎉 All URLs are already in the knowledge base!")
        else:
            print(f"\n🆕 New URLs to be processed:")
            for i, url in enumerate(new_urls[:5], 1):  # Show first 5
                print(f"   {i}. {url}")
            if len(new_urls) > 5:
                print(f"   ... and {len(new_urls) - 5} more")
    else:
        print("📂 No existing documents found - all URLs will be processed")
        print(f"🆕 Will process all {len(new_urls)} URLs")
    
    return new_urls

async def main():
    # 1. Load URLs from file
    print("🚀 Starting data ingestion process...")
    url_list = load_urls_from_file("pages.txt")
    
    if not url_list:
        print("❌ No URLs to process. Exiting.")
        return
    
    print(f"📊 Total URLs to check: {len(url_list)}")
    
    # 2. Initialize LightRAG with your Gemini functions
    print("\n⚙️ Initializing LightRAG system...")
    rag = LightRAG(
        working_dir=WORKING_DIR,
        embedding_func=gemini_embedding_wrapper,
        llm_model_func=mistral_llm_func,
        llm_model_max_async=5, # Set concurrency for LLM calls
    )
    
    # IMPORTANT: Both initialization calls are required!
    await rag.initialize_storages()
    await initialize_pipeline_status() # This was the missing step
    print("✅ LightRAG storage initialized.")

    # 3. Check which URLs are already processed
    urls_to_process = await check_existing_documents(rag, url_list)
    
    if not urls_to_process:
        print("🎉 All URLs are already processed!")
        return

    # 4. Scrape content first
    print(f"\n🌐 Starting web scraping for {len(urls_to_process)} URLs...")
    documents_to_insert = []
    scraping_stats = {"success": 0, "failed": 0, "empty": 0}
    
    crawler = AsyncWebCrawler()
    try:
        await crawler.start()
        print("🔍 DEBUG: AsyncWebCrawler started successfully")
        
        for i, url in enumerate(urls_to_process, 1):
            print(f"\n📥 [{i}/{len(urls_to_process)}] Crawling: {url}")
            
            try:
                result = await crawler.arun(url=url)
                
                if result and result.success:
                    # Try fit_markdown first, fall back to raw markdown if empty
                    scraped_text = None
                    if result.markdown and result.markdown.fit_markdown:
                        scraped_text = result.markdown.fit_markdown
                    elif result.markdown:
                        scraped_text = result.markdown
                    
                    if scraped_text and len(scraped_text) > 500: # Increased threshold for better quality
                        documents_to_insert.append({"text": scraped_text, "id": url})
                        scraping_stats["success"] += 1
                        print(f"   ✅ Success: {len(scraped_text):,} characters scraped")
                    else:
                        scraping_stats["empty"] += 1
                        print(f"   ⚠️ Skipped: Empty or short content (length: {len(scraped_text) if scraped_text else 0})")
                else:
                    scraping_stats["failed"] += 1
                    error_msg = result.error_message if result else 'No result returned'
                    print(f"   ❌ Failed: {error_msg}")
                    
            except Exception as e:
                scraping_stats["failed"] += 1
                print(f"   ❌ Exception: {str(e)}")
                continue
        
        print("🔍 DEBUG: For loop completed, about to close crawler...")
        
    finally:
        # Explicitly close the crawler
        await crawler.close()
        print("🔍 DEBUG: AsyncWebCrawler closed successfully")
    
    print("\n🔍 DEBUG: Scraping phase completely finished, processing results...")
    print(f"🔍 DEBUG: documents_to_insert has {len(documents_to_insert)} items")
    
    # 5. Print scraping summary
    print(f"\n📊 Scraping Summary:")
    print(f"   ✅ Successful: {scraping_stats['success']}")
    print(f"   ❌ Failed: {scraping_stats['failed']}")
    print(f"   ⚠️ Empty/Short: {scraping_stats['empty']}")
    print(f"   📝 Ready for insertion: {len(documents_to_insert)}")
    
    print("🔍 DEBUG: About to check if documents_to_insert has content...")
    
    # 6. Insert all documents at once
    if documents_to_insert:
        print("🔍 DEBUG: Starting document insertion block...")
        print(f"\n⚙️ Starting document insertion process...")
        print(f"📤 Inserting {len(documents_to_insert)} documents into LightRAG knowledge base")
        print("⏳ This may take several minutes depending on document size and API limits...")
        
        print("🔍 DEBUG: Preparing texts and ids arrays...")
        texts = [doc["text"] for doc in documents_to_insert]
        ids = [doc["id"] for doc in documents_to_insert]
        
        # Show some stats about the documents
        total_chars = sum(len(text) for text in texts)
        avg_chars = total_chars // len(texts) if texts else 0
        print(f"📈 Document stats: {total_chars:,} total chars, {avg_chars:,} avg chars per doc")
        
        print("🔍 DEBUG: About to call rag.ainsert()...")
        # Using the async `ainsert` method adds documents to the processing queue
        print("🔄 Step 1/2: Adding documents to processing queue...")
        await rag.ainsert(texts, ids=ids)
        print("✅ All documents enqueued successfully!")
        print("🔍 DEBUG: rag.ainsert() completed successfully!")

        # Now, process the entire queue
        print("🔍 DEBUG: About to call rag.apipeline_process_enqueue_documents()...")
        print("🔄 Step 2/2: Processing the document queue (knowledge graph extraction)...")
        print("⚡ This is where the AI extracts entities, relationships, and builds the knowledge graph...")
        await rag.apipeline_process_enqueue_documents()
        print("✅ All documents processed and knowledge graph updated!")
        print("🔍 DEBUG: rag.apipeline_process_enqueue_documents() completed successfully!")
        
    else:
        print("🔍 DEBUG: No documents to insert")
        print("\n❌ No documents to insert - all URLs either failed or had insufficient content.")

    print("🔍 DEBUG: About to finalize storage...")
    print("\n🔄 Finalizing storage...")
    await rag.finalize_storages()
    print("🎉 Data ingestion complete! Knowledge base is ready for queries.")
    print(f"💾 Data stored in: {WORKING_DIR}")
    
if __name__ == "__main__":
    asyncio.run(main()) 