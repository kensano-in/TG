import os
import sys
import time
from datetime import datetime

# Setup paths
backend_dir = os.path.dirname(os.path.abspath(__file__))
db_path = os.path.join(backend_dir, "manager.db")

def run_backup():
    print(f"[{datetime.now().isoformat()}] Starting SQLite database backup sequence...")
    
    # 1. Verify source database exists
    if not os.path.exists(db_path):
        print(f"❌ Error: Source database not found at {db_path}")
        sys.exit(1)
        
    # 2. Get GCS Bucket Name from environment variable
    bucket_name = os.getenv("GCP_BACKUP_BUCKET")
    if not bucket_name:
        print("⚠️ Warning: GCP_BACKUP_BUCKET environment variable is not set.")
        print("Please configure this setting in your environment or Secret Manager.")
        sys.exit(1)
        
    try:
        from google.cloud import storage
        
        # 3. Initialize GCS client using default credentials (works out-of-the-box on GCE VM!)
        storage_client = storage.Client()
        bucket = storage_client.bucket(bucket_name)
        
        # 4. Generate timestamped file name
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        blob_name = f"backups/manager_backup_{timestamp}.db"
        blob = bucket.blob(blob_name)
        
        print(f"📦 Uploading {db_path} to gs://{bucket_name}/{blob_name}...")
        blob.upload_from_filename(db_path)
        print("✓ Backup uploaded successfully.")
        
        # 5. Prune old backups in the bucket to save space (keep last 30 days)
        print("🧹 Checking for expired backups (older than 30 days)...")
        blobs = list(storage_client.list_blobs(bucket, prefix="backups/"))
        now_ts = time.time()
        prune_count = 0
        
        for b in blobs:
            # Skip folders if any
            if b.name.endswith("/"):
                continue
            # Check age of blob (30 days = 2592000 seconds)
            elapsed = now_ts - time.mktime(b.updated.timetuple())
            if elapsed > 2592000:
                print(f"🗑️ Pruning old backup: {b.name}")
                b.delete()
                prune_count += 1
                
        if prune_count > 0:
            print(f"✓ Pruned {prune_count} expired backups.")
        else:
            print("✓ No expired backups found.")
            
    except ImportError:
        print("❌ Error: google-cloud-storage package is not installed.")
        print("Please run: pip install google-cloud-storage")
        sys.exit(1)
    except Exception as e:
        print(f"❌ Backup failed with exception: {e}")
        sys.exit(1)

if __name__ == "__main__":
    run_backup()
