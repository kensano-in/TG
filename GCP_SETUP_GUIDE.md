# 🏆 Google Cloud Platform: Always-Free Setup & Deployment Guide

This guide details how to provision your Virtual Machine (VM) and Cloud Storage (GCS) bucket within the **GCP Always Free Tier** limits, preserving your $300 credit as a safety net.

---

## 📦 Step 1: Create a Free-Tier GCS Backup Bucket
1. Open your [Google Cloud Console](https://console.cloud.google.com/).
2. In the left navigation menu, go to **Cloud Storage** ➡️ **Buckets** ➡️ click **Create**.
3. **Name your bucket:** e.g., `coet-db-backups-unique` (names must be globally unique).
4. **Location Type:** Select **Region** ➡️ Choose one of:
   - `us-central1` (Iowa)
   - `us-east1` (South Carolina)
   - `us-west1` (Oregon)
5. **Storage Class:** Select **Standard** (Always Free Tier provides 5 GB of Standard Storage).
6. **Access Control:** Select **Uniform** (recommended) and keep public access prevention enabled.
7. Click **Create**.

---

## 🖥️ Step 2: Provision the Free-Tier Compute Engine VM
1. In the GCP menu, navigate to **Compute Engine** ➡️ **VM Instances** ➡️ click **Create Instance**.
2. **Name:** `coet-server`
3. **Region:** Select the **same region** you chose for your Storage bucket (`us-central1`, `us-east1`, or `us-west1`).
4. **Machine Configuration:**
   - **Series:** `E2`
   - **Machine Type:** **`e2-micro`** (2 vCPU, 1 GB RAM). 
   - *Note: Choosing any other series or size will consume your credits.*
5. **Boot Disk:** Click **Change**:
   - **Operating System:** `Ubuntu`
   - **Version:** `Ubuntu 22.04 LTS` or `Ubuntu 24.04 LTS`
   - **Boot disk type:** `Balanced persistent disk`
   - **Size:** **`30` GB** (Always Free Tier persistent disk limit is exactly 30 GB).
   - Click **Select**.
6. **API Access & Scopes:** Under **Identity and API access**:
   - Select **Set access for each API**:
     - Under **Storage**: Change to **Read Write** (this allows the VM to upload backups to your GCS bucket without needing manual JSON service keys!).
7. **Firewall:**
   - Check **Allow HTTP traffic**.
   - Check **Allow HTTPS traffic**.
8. Click **Create**.

---

## ⚙️ Step 3: Configure VM Firewall Rules for Dashboard
By default, GCP blocks ports `8000` (FastAPI) and `5173`/`5174` (Vite dev servers). Let's open them:
1. In the search bar at the top, type **Firewall** (under VPC Network) ➡️ click **Create Firewall Rule**.
2. **Name:** `allow-coet-ports`
3. **Targets:** Select **All instances in the network**.
4. **Source IP ranges:** Enter `0.0.0.0/0`.
5. **Protocols and ports:** Check **Specified protocols and ports** ➡️ check **tcp** ➡️ enter `8000, 5173, 5174`.
6. Click **Create**.

---

## 🚀 Step 4: Server Installation & Deployment
Connect to your VM using the **SSH** button on your VM instances list page and run these commands:

1. **Update and Install Node.js & Git:**
   ```bash
   sudo apt-get update && sudo apt-get upgrade -y
   sudo apt-get install -y python3-pip python3-venv git curl
   curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
   sudo apt-get install -y nodejs
   ```

2. **Clone & Setup Repo:**
   ```bash
   git clone https://github.com/kensano-in/TG.git
   cd TG
   ```

3. **Install Python Packages & Storage Client:**
   ```bash
   cd backend
   python3 -m venv venv
   source venv/bin/activate
   pip install -r requirements.txt
   pip install google-cloud-storage
   ```

4. **Setup Environment Variables:**
   Create your `.env` file in the `backend/` folder:
   ```bash
   nano .env
   ```
   Add your variables, including the bucket name:
   ```env
   GCP_BACKUP_BUCKET=coet-db-backups-unique
   # ... other keys ...
   ```

5. **Start Systemd Service for Auto-start:**
   ```bash
   sudo cp coet-manager.service /etc/systemd/system/
   sudo systemctl daemon-reload
   sudo systemctl enable coet-manager
   sudo systemctl start coet-manager
   ```

6. **Start Vite Dev Server (Frontend):**
   ```bash
   cd ../frontend
   npm install
   npm run dev -- --host
   ```

You are now fully live on Google Cloud Platform under the 100% Free Tier!
