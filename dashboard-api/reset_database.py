import sqlite3
import os
import sys

def reset_database(db_path="conversations.db"):
    """
    Reset the database by deleting all conversations and messages.
    
    Args:
        db_path: Path to the SQLite database file
    """
    print(f"Attempting to reset database at: {db_path}")
    
    # Check if the database file exists
    if not os.path.exists(db_path):
        print(f"Database file not found at: {db_path}")
        print("Database file not found. Please specify the correct path.")
        return False
    
    try:
        # Connect to the database
        conn = sqlite3.connect(db_path)
        cursor = conn.cursor()
        
        # Get count of conversations and messages before deletion
        cursor.execute("SELECT COUNT(*) FROM conversations")
        conv_count = cursor.fetchone()[0]
        
        cursor.execute("SELECT COUNT(*) FROM messages")
        msg_count = cursor.fetchone()[0]
        
        print(f"Found {conv_count} conversations and {msg_count} messages.")
        
        # Delete all messages first (should cascade, but being explicit)
        cursor.execute("DELETE FROM messages")
        print("Deleted all messages.")
        
        # Delete all conversations
        cursor.execute("DELETE FROM conversations")
        print("Deleted all conversations.")
        
        # Commit the changes
        conn.commit()
        
        # Verify deletion
        cursor.execute("SELECT COUNT(*) FROM conversations")
        new_conv_count = cursor.fetchone()[0]
        
        cursor.execute("SELECT COUNT(*) FROM messages")
        new_msg_count = cursor.fetchone()[0]
        
        print(f"After deletion: {new_conv_count} conversations and {new_msg_count} messages remain.")
        
        # Close connection
        conn.close()
        
        return True
    except sqlite3.Error as e:
        print(f"SQLite error: {e}")
        return False
    except Exception as e:
        print(f"Error: {e}")
        return False

if __name__ == "__main__":
    # Allow specifying database path as command-line argument
    db_path = sys.argv[1] if len(sys.argv) > 1 else "conversations.db"
    success = reset_database(db_path)
    
    if success:
        print("Database reset successful!")
    else:
        print("Database reset failed.")
        sys.exit(1) 