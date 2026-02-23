#!/bin/bash
# ============================================================
# SSMSPL Production Deployment Script for VPS
# Domain: carferry.online
# ============================================================
set -e

echo "=== SSMSPL Production Deployment ==="
echo ""

# ------ 1. Pre-flight checks ------
if [ ! -f "./backend/.env.production" ]; then
    echo "ERROR: backend/.env.production not found!"
    exit 1
fi

# Check if SECRET_KEY has been changed from default
SECRET_KEY=$(grep "^SECRET_KEY=" ./backend/.env.production | cut -d'=' -f2)
if [ "$SECRET_KEY" = "CHANGE_ME_BEFORE_DEPLOY" ]; then
    echo "ERROR: You must change SECRET_KEY in backend/.env.production"
    echo "Generate one with: python -c \"import secrets; print(secrets.token_urlsafe(48))\""
    exit 1
fi

echo "[OK] Pre-flight checks passed"

# ------ 2. Set up SSL (first time only) ------
if [ ! -d "./certbot/conf/live/carferry.online" ]; then
    echo ""
    echo "=== SSL Certificate Setup ==="
    echo "SSL certificates not found. Setting up Let's Encrypt..."
    echo ""

    # Use initial nginx config (HTTP only) for cert challenge
    if [ -f "./nginx/conf.d/default.conf" ]; then
        cp ./nginx/conf.d/default.conf ./nginx/conf.d/default-ssl.conf.bak
    fi
    cp ./nginx/conf.d/default-initial.conf ./nginx/conf.d/default.conf

    # Start only nginx and required services
    docker compose -f docker-compose.prod.yml up -d nginx

    echo "Waiting for nginx to start..."
    sleep 5

    # Request certificates
    echo "Requesting SSL certificates from Let's Encrypt..."
    read -p "Enter your email for Let's Encrypt notifications: " CERT_EMAIL

    docker compose -f docker-compose.prod.yml run --rm certbot certonly \
        --webroot -w /var/www/certbot \
        -d carferry.online -d www.carferry.online -d api.carferry.online \
        --email "$CERT_EMAIL" \
        --agree-tos --no-eff-email

    # Stop nginx, restore SSL config
    docker compose -f docker-compose.prod.yml down

    if [ -f "./nginx/conf.d/default-ssl.conf.bak" ]; then
        mv ./nginx/conf.d/default-ssl.conf.bak ./nginx/conf.d/default.conf
    fi

    echo "[OK] SSL certificates obtained"
else
    echo "[OK] SSL certificates found"
fi

# ------ 3. Build & Deploy ------
echo ""
echo "=== Building & Starting Services ==="
docker compose -f docker-compose.prod.yml up --build -d

echo ""
echo "=== Waiting for services to be healthy ==="
sleep 10

# ------ 4. Health check ------
echo ""
echo "=== Running Health Checks ==="

# Check if containers are running
for service in db backend frontend nginx; do
    STATUS=$(docker compose -f docker-compose.prod.yml ps --format json "$service" 2>/dev/null | grep -o '"Status":"[^"]*"' | head -1)
    echo "  $service: $STATUS"
done

echo ""
echo "=== Deployment Complete ==="
echo ""
echo "Your site should now be accessible at:"
echo "  Frontend: https://carferry.online"
echo "  API:      https://api.carferry.online"
echo "  Health:   https://api.carferry.online/health"
echo ""
echo "IMPORTANT: Make sure DNS records point to this server:"
echo "  A  carferry.online      -> <your-vps-ip>"
echo "  A  www.carferry.online  -> <your-vps-ip>"
echo "  A  api.carferry.online  -> <your-vps-ip>"
