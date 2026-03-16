import multiprocessing
import os

# Worker class for async FastAPI
worker_class = "uvicorn.workers.UvicornWorker"

# Number of workers: 2 * CPU cores + 1 (standard formula)
workers = multiprocessing.cpu_count() * 2 + 1

# Bind address
bind = "0.0.0.0:8000"

# Timeouts
timeout = 120
keepalive = 5

# Graceful restart timeout
graceful_timeout = 30

# Restart workers periodically to prevent memory leaks
max_requests = 5000
max_requests_jitter = 500

# Logging
accesslog = "-"
errorlog = "-"
loglevel = "info"

# Preload app for faster worker startup
preload_app = True

# Trust proxy headers only from known reverse proxies.
# In Docker: nginx is the only service forwarding to gunicorn on the 'internal' network.
# The Docker internal network is isolated (not exposed to the host), so trusting all
# IPs within it is acceptable. If deploying outside Docker, set FORWARDED_ALLOW_IPS
# to the specific nginx IP address(es).
forwarded_allow_ips = os.environ.get("FORWARDED_ALLOW_IPS", "*")
