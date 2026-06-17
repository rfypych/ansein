# AnseIn Deployment Guide

Three deployment scenarios covered:

1. [**cPanel shared hosting**](#1-cpanel-shared-hosting-mysql--passenger-wsgi) — the original target (MySQL + Passenger WSGI)
2. [**Docker Compose**](#2-docker-compose-mysql--redis--app) — local/staging with full stack
3. [**VPS / bare metal**](#3-vps--bare-metal-systemd--nginx) — production with systemd + nginx

---

## 1. cPanel Shared Hosting (MySQL + Passenger WSGI)

This is the recommended path for shared cPanel accounts.

### Prerequisites

- cPanel account with:
  - **Python app** support (Setup Python App in cPanel)
  - **MySQL Database** Wizard
  - **Terminal** access (or File Manager + SSH)
- A Groq API key (free tier available at https://console.groq.com/keys) — used for LLM features. Optional: OpenAI, VirusTotal, AbuseIPDB, Shodan.

### Step-by-step

#### A. Create the MySQL database

In cPanel → **MySQL Database Wizard**:

1. Create database: `youruser_ansein`
2. Create user: `youruser_anseinuser` with a strong password
3. Grant **ALL PRIVILEGES** on the database to the user
4. Note the **connection string**:
   ```
   mysql+pymysql://youruser_anseinuser:PASSWORD@127.0.0.1:3306/youruser_ansein?charset=utf8mb4
   ```

#### B. Upload the code

1. In cPanel → **File Manager**, navigate to your home directory (`/home/youruser/`)
2. Create a folder `ansein`
3. Upload the entire `backend/` folder contents into `/home/youruser/ansein/`
   - (Optional) Upload `frontend/dist/` to `/home/youruser/public_html/` if you want the frontend served from the document root
4. Alternatively, use SSH + git:
   ```bash
   cd ~
   git clone https://github.com/rfypych/ansein.git
   ```

#### C. Create the Python app

In cPanel → **Setup Python App**:

1. **Create Application**
   - Python version: 3.12 (or latest available)
   - App root: `/home/youruser/ansein`
   - App URL: `yourdomain.com/` (or a subdomain)
   - App startup file: `passenger_wsgi.py`
   - Entry point: `application`
2. Click **Create**

#### D. Install dependencies

In the Python app's "Run pip install" box (or via SSH):

```bash
cd /home/youruser/ansein
pip install -r requirements.txt
```

#### E. Configure environment

Edit `/home/youruser/ansein/.env`:

```env
APP_ENV=production
APP_DEBUG=false
APP_URL=https://yourdomain.com
SECRET_KEY=<generate a 50+ char random string>
DATABASE_URL=mysql+pymysql://youruser_anseinuser:PASSWORD@127.0.0.1:3306/youruser_ansein?charset=utf8mb4
SETUP_MODE=auto
CORS_ORIGINS=https://yourdomain.com
RATE_LIMIT_PER_MINUTE=60
```

To generate a strong SECRET_KEY:
```bash
python -c "import secrets; print(secrets.token_urlsafe(48))"
```

#### F. Run migrations

Via SSH or cPanel Terminal:
```bash
cd /home/youruser/ansein
alembic upgrade head
```

#### G. Restart the Python app

In cPanel → **Setup Python App** → click **Restart**.

#### H. Complete the setup wizard

1. Visit `https://yourdomain.com/` — you'll be redirected to `/setup`
2. Step 1 should already be complete (DB is configured)
3. Step 2: Create your admin account
4. Log in and start using AnseIn

#### I. (Optional) Serve frontend separately

If your cPanel doesn't run the FastAPI app at the document root, you can:

1. Build the frontend locally:
   ```bash
   cd frontend
   npm install
   npm run build
   ```
2. Upload the contents of `frontend/dist/` to `/home/youruser/public_html/`
3. Edit `frontend/dist/assets/index-*.js` to hardcode the API URL (or use a `.env` file with `VITE_API_BASE_URL`)

---

## 2. Docker Compose (MySQL + Redis + App)

For local/staging deployments with all services.

### docker-compose.yml

```yaml
version: "3.9"
services:
  db:
    image: mysql:8.0
    environment:
      MYSQL_DATABASE: ansein
      MYSQL_USER: ansein
      MYSQL_PASSWORD: ansein_pw
      MYSQL_ROOT_PASSWORD: root_pw
    volumes:
      - ansein-db:/var/lib/mysql
    ports:
      - "3306:3306"

  redis:
    image: redis:7-alpine
    ports:
      - "6379:6379"

  api:
    build: ./backend
    environment:
      DATABASE_URL: mysql+pymysql://ansein:ansein_pw@db:3306/ansein?charset=utf8mb4
      REDIS_URL: redis://redis:6379/0
      CELERY_BROKER_URL: redis://redis:6379/1
      SECRET_KEY: ${SECRET_KEY:-dev-secret-change-me}
      APP_ENV: production
    depends_on:
      - db
      - redis
    ports:
      - "8000:8000"

  frontend:
    build: ./frontend
    ports:
      - "80:80"
    depends_on:
      - api

volumes:
  ansein-db:
```

### backend/Dockerfile

```dockerfile
FROM python:3.12-slim
WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY . .
EXPOSE 8000
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
```

### frontend/Dockerfile

```dockerfile
FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM nginx:alpine
COPY --from=build /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
```

### frontend/nginx.conf

```nginx
server {
    listen 80;
    root /usr/share/nginx/html;
    index index.html;

    location /api/ {
        proxy_pass http://api:8000/api/;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }

    location / {
        try_files $uri $uri/ /index.html;
    }
}
```

### Run

```bash
# Generate a strong SECRET_KEY
export SECRET_KEY=$(python -c "import secrets; print(secrets.token_urlsafe(48))")

# Start the stack
docker compose up -d

# Run migrations
docker compose exec api alembic upgrade head

# Visit http://localhost and complete setup wizard
```

---

## 3. VPS / Bare Metal (systemd + nginx)

For production servers where you have root.

### Prerequisites

- Ubuntu 22.04+ or Debian 12+
- MySQL 8.0+ installed
- Python 3.12+
- Node.js 22+ (for building frontend)
- nginx

### Steps

```bash
# Create a dedicated user
sudo useradd -m -s /bin/bash ansein
sudo su - ansein

# Clone and install
git clone https://github.com/rfypych/ansein.git
cd ansein/backend
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt

# Build frontend
cd ../frontend
npm install && npm run build
cd ../backend

# Configure
cp .env.example .env
nano .env  # set DATABASE_URL, SECRET_KEY, etc.

# Run migrations
alembic upgrade head
```

### systemd unit

Create `/etc/systemd/system/ansein.service`:

```ini
[Unit]
Description=AnseIn Threat Intelligence Platform
After=network.target mysql.service

[Service]
Type=exec
User=ansein
WorkingDirectory=/home/ansein/ansein/backend
EnvironmentFile=/home/ansein/ansein/backend/.env
ExecStart=/home/ansein/ansein/backend/.venv/bin/uvicorn app.main:app --host 127.0.0.1 --port 8000 --workers 4
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
```

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now ansein
sudo systemctl status ansein
```

### nginx config

Create `/etc/nginx/sites-available/ansein`:

```nginx
server {
    listen 80;
    server_name ansein.yourdomain.com;
    return 301 https://$host$request_uri;
}

server {
    listen 443 ssl http2;
    server_name ansein.yourdomain.com;

    ssl_certificate /etc/letsencrypt/live/ansein.yourdomain.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/ansein.yourdomain.com/privkey.pem;

    # API
    location /api/ {
        proxy_pass http://127.0.0.1:8000/api/;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    # Static frontend (built React app)
    location / {
        root /home/ansein/ansein/frontend/dist;
        try_files $uri $uri/ /index.html;
    }

    # Static assets (long cache)
    location /assets/ {
        root /home/ansein/ansein/frontend/dist;
        expires 1y;
        add_header Cache-Control "public, immutable";
    }
}
```

```bash
sudo ln -s /etc/nginx/sites-available/ansein /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl reload nginx

# Get TLS cert via Let's Encrypt
sudo certbot --nginx -d ansein.yourdomain.com
```

---

## Post-deployment checklist

- [ ] `SECRET_KEY` is set to a strong random value (not the default)
- [ ] `APP_ENV=production` and `APP_DEBUG=false`
- [ ] HTTPS is enforced (cPanel AutoSSL or Let's Encrypt)
- [ ] Database user has only the privileges needed (no `GRANT ALL` on `*.*`)
- [ ] Backups are scheduled (cPanel → Backup, or `mysqldump` cron)
- [ ] Rate limit is appropriate (`RATE_LIMIT_PER_MINUTE=60` for shared hosting)
- [ ] At least one LLM API key is configured (Groq recommended — free tier)
- [ ] First user account is admin (verify via `/api/v1/auth/me`)
- [ ] Test the full pipeline end-to-end with a sample threat report

---

## Troubleshooting

### App returns 502 Bad Gateway

- Check the Python app's error log in cPanel → Setup Python App → Error Log
- Verify `passenger_wsgi.py` exists and imports cleanly: `python -c "import passenger_wsgi"`
- Ensure all requirements installed: `pip install -r requirements.txt`

### Database connection failed

- Verify the DATABASE_URL format (must start with `mysql+pymysql://`)
- Test the connection from cPanel Terminal:
  ```bash
  python -c "from sqlalchemy import create_engine; e=create_engine('YOUR_URL'); e.connect()"
  ```
- Check the MySQL user has access to the database (`GRANT ALL ON youruser_ansein.* TO ...`)

### Setup wizard keeps redirecting back

- The wizard checks `admin_exists` after DB setup. If you skipped admin creation, go to `/setup` again.
- Or use the API directly: `POST /api/v1/setup/admin` with email/password.

### LLM features not working

- Without an API key, the Copilot returns a "configure an API key" message — by design.
- Analysis falls back to a heuristic mode (no narrative text, just severity scores).
- Set `GROQ_API_KEY` in `.env` for system-wide access, or per-user via Settings → API Keys.

### Frontend not loading

- If serving frontend separately from the backend, ensure CORS_ORIGINS includes the frontend's origin
- For cPanel: upload `frontend/dist/*` to `public_html/`
- For Docker: the nginx config in `frontend/Dockerfile` handles routing
