import requests
import json

# The backend API runs on localhost:5000 by default
BASE_URL = "http://localhost:5000/api"

def clear_all_conversations():
    """
    Fetches all conversations from the chatbot API and deletes them.
    """
    print("Attempting to clear all conversation history...")
    
    try:
        # Step 1: Get all conversations
        get_response = requests.get(f"{BASE_URL}/conversations")
        
        if get_response.status_code != 200:
            print(f"Error fetching conversations: Status {get_response.status_code}")
            print(get_response.text)
            return

        conversations = get_response.json().get("conversations", [])

        if not conversations:
            print("No conversations to delete.")
            return

        print(f"Found {len(conversations)} conversations. Deleting them now...")

        # Step 2: Delete each conversation
        for conversation in conversations:
            conv_id = conversation.get("id")
            if not conv_id:
                continue
            
            print(f"  - Deleting conversation {conv_id}...")
            delete_response = requests.delete(f"{BASE_URL}/conversations/{conv_id}")
            
            if delete_response.status_code == 200:
                print(f"    ✓ Successfully deleted {conv_id}")
            else:
                print(f"    ✗ Failed to delete {conv_id}. Status: {delete_response.status_code}, Response: {delete_response.text}")

        print("\nConversation history cleared successfully.")

    except requests.exceptions.ConnectionError:
        print("\nError: Could not connect to the backend server.")
        print("Please make sure the Flask API server is running on http://localhost:5000.")
    except Exception as e:
        print(f"\nAn unexpected error occurred: {e}")

if __name__ == "__main__":
    clear_all_conversations() 