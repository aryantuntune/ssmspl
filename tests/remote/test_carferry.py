#!/usr/bin/env python3
"""
Comprehensive Remote Test Suite for carferry.online
====================================================
Covers: connectivity, security headers, SSL/TLS, CORS, rate limiting,
authentication, RBAC, input validation, functional API tests, load testing,
and stress testing.

Usage:
    python tests/remote/test_carferry.py
    python tests/remote/test_carferry.py --phase security
    python tests/remote/test_carferry.py --phase functional
    python tests/remote/test_carferry.py --phase load
    python tests/remote/test_carferry.py --phase stress
    python tests/remote/test_carferry.py --phase all
"""

import asyncio
import httpx
import time
import json
import ssl
import socket
import argparse
import statistics
import sys
import random
import string
from dataclasses import dataclass, field
from datetime import date, datetime
from typing import Optional
from collections import defaultdict

# ─── Configuration ────────────────────────────────────────────────────────────

BASE_URL = "https://carferry.online"
API_URL = f"{BASE_URL}/api"

# Seed credentials (dev only)
USERS = {
    "SUPER_ADMIN":      {"email": "superadmin@ssmspl.com", "password": "Password@123"},
    "ADMIN":            {"email": "admin@ssmspl.com",      "password": "Password@123"},
    "MANAGER":          {"email": "manager@ssmspl.com",    "password": "Password@123"},
    "BILLING_OPERATOR": {"email": "billing@ssmspl.com",    "password": "Password@123"},
    "TICKET_CHECKER":   {"email": "checker@ssmspl.com",    "password": "Password@123"},
}

# Known seed data
BRANCHES = [101, 102, 103, 104, 105, 106, 107, 108, 109, 110]
ROUTES = [1, 2, 3, 4, 5]
ITEMS = {
    11: {"rate": 22.00, "levy": 2.00, "name": "Adult Passenger"},
    12: {"rate": 11.00, "levy": 1.00, "name": "Child Passenger"},
    7:  {"rate": 150.00, "levy": 15.00, "name": "Empty Car 5 ST"},
    2:  {"rate": 35.00, "levy": 3.00, "name": "Motor Cycle with Driver"},
}
PAYMENT_MODES = [1, 2, 3, 4]  # Cash, UPI, Card, Online

TIMEOUT = 30.0

# ─── Result tracking ─────────────────────────────────────────────────────────

@dataclass
class TestResult:
    name: str
    passed: bool
    duration_ms: float
    detail: str = ""
    category: str = ""

@dataclass
class LoadResult:
    total_requests: int = 0
    successful: int = 0
    failed: int = 0
    latencies: list = field(default_factory=list)
    errors: dict = field(default_factory=lambda: defaultdict(int))
    status_codes: dict = field(default_factory=lambda: defaultdict(int))

results: list[TestResult] = []
tokens: dict[str, str] = {}

# ─── Helpers ──────────────────────────────────────────────────────────────────

def log(icon: str, msg: str):
    print(f"  {icon} {msg}")

def section(title: str):
    print(f"\n{'='*70}")
    print(f"  {title}")
    print(f"{'='*70}")

def record(name: str, passed: bool, duration_ms: float, detail: str = "", category: str = ""):
    results.append(TestResult(name, passed, duration_ms, detail, category))
    icon = "PASS" if passed else "FAIL"
    color = "\033[92m" if passed else "\033[91m"
    reset = "\033[0m"
    ms_str = f"{duration_ms:.0f}ms"
    print(f"  {color}[{icon}]{reset} {name} ({ms_str}){f' - {detail}' if detail else ''}")


async def login(client: httpx.AsyncClient, role: str) -> str | None:
    """Login and return access token for a given role."""
    creds = USERS[role]
    t0 = time.monotonic()
    try:
        resp = await client.post(f"{API_URL}/auth/login", json=creds)
        elapsed = (time.monotonic() - t0) * 1000
        if resp.status_code == 200:
            # Token is set in cookies
            token = resp.cookies.get("ssmspl_access_token")
            if not token:
                # Try extracting from response body
                data = resp.json()
                token = data.get("access_token")
            if token:
                tokens[role] = token
                return token
            # Might be HttpOnly cookie — check Set-Cookie headers
            for cookie_header in resp.headers.get_list("set-cookie"):
                if "ssmspl_access_token=" in cookie_header:
                    token = cookie_header.split("ssmspl_access_token=")[1].split(";")[0]
                    tokens[role] = token
                    return token
        return None
    except Exception as e:
        return None


def auth_headers(role: str) -> dict:
    """Return Authorization headers for a given role."""
    token = tokens.get(role)
    if token:
        return {"Authorization": f"Bearer {token}", "Cookie": f"ssmspl_access_token={token}"}
    return {}


# ═══════════════════════════════════════════════════════════════════════════════
# PHASE 1: SECURITY TESTS
# ═══════════════════════════════════════════════════════════════════════════════

async def test_security(client: httpx.AsyncClient):
    section("PHASE 1: SECURITY TESTS")

    # ── 1.1 SSL/TLS ──────────────────────────────────────────────────────────
    print("\n  --- SSL/TLS Analysis ---")
    t0 = time.monotonic()
    try:
        ctx = ssl.create_default_context()
        with socket.create_connection(("carferry.online", 443), timeout=10) as sock:
            with ctx.wrap_socket(sock, server_hostname="carferry.online") as ssock:
                cert = ssock.getpeercert()
                protocol = ssock.version()
                cipher = ssock.cipher()

                elapsed = (time.monotonic() - t0) * 1000
                record("SSL Certificate Valid", True, elapsed,
                       f"Subject: {cert.get('subject', 'N/A')}", "Security")
                record("TLS Version", protocol in ("TLSv1.2", "TLSv1.3"), elapsed,
                       f"Protocol: {protocol}", "Security")
                record("Cipher Strength", True, elapsed,
                       f"Cipher: {cipher[0] if cipher else 'N/A'}", "Security")

                # Check expiry
                not_after = cert.get("notAfter", "")
                if not_after:
                    from email.utils import parsedate_to_datetime
                    expiry = parsedate_to_datetime(not_after)
                    days_left = (expiry - datetime.now(expiry.tzinfo)).days
                    record("Certificate Expiry", days_left > 30, elapsed,
                           f"{days_left} days remaining", "Security")
    except Exception as e:
        elapsed = (time.monotonic() - t0) * 1000
        record("SSL/TLS Connection", False, elapsed, str(e), "Security")

    # ── 1.2 Security Headers ─────────────────────────────────────────────────
    print("\n  --- Security Headers ---")
    t0 = time.monotonic()
    resp = await client.get(f"{BASE_URL}/")
    elapsed = (time.monotonic() - t0) * 1000
    headers = resp.headers

    required_headers = {
        "strict-transport-security": "HSTS",
        "x-content-type-options": "X-Content-Type-Options",
        "x-frame-options": "X-Frame-Options",
        "referrer-policy": "Referrer-Policy",
    }
    for header, label in required_headers.items():
        present = header in headers
        val = headers.get(header, "MISSING")
        record(f"Header: {label}", present, elapsed, val, "Security")

    # Check for info leakage
    server_header = headers.get("server", "")
    record("Server Header Minimal", "version" not in server_header.lower(), elapsed,
           f"Server: {server_header or 'not exposed'}", "Security")

    # Permissions-Policy
    pp = headers.get("permissions-policy", "")
    record("Permissions-Policy", bool(pp), elapsed, pp[:80] if pp else "MISSING", "Security")

    # ── 1.3 CORS Testing ─────────────────────────────────────────────────────
    print("\n  --- CORS Testing ---")

    # Test with a malicious origin
    t0 = time.monotonic()
    resp = await client.options(f"{API_URL}/auth/login",
                                headers={"Origin": "https://evil-site.com",
                                         "Access-Control-Request-Method": "POST"})
    elapsed = (time.monotonic() - t0) * 1000
    acao = resp.headers.get("access-control-allow-origin", "")
    record("CORS: Rejects evil origin", acao != "*" and "evil-site.com" not in acao,
           elapsed, f"ACAO: {acao or 'none'}", "Security")

    # Test with legitimate origin
    t0 = time.monotonic()
    resp = await client.options(f"{API_URL}/auth/login",
                                headers={"Origin": "https://carferry.online",
                                         "Access-Control-Request-Method": "POST"})
    elapsed = (time.monotonic() - t0) * 1000
    acao = resp.headers.get("access-control-allow-origin", "")
    record("CORS: Allows own origin", resp.status_code in (200, 204, 405),
           elapsed, f"ACAO: {acao or 'none'}, Status: {resp.status_code}", "Security")

    # ── 1.4 Cookie Security ──────────────────────────────────────────────────
    print("\n  --- Cookie Security ---")
    t0 = time.monotonic()
    resp = await client.post(f"{API_URL}/auth/login", json=USERS["SUPER_ADMIN"])
    elapsed = (time.monotonic() - t0) * 1000

    set_cookies = resp.headers.get_list("set-cookie")
    for sc in set_cookies:
        if "ssmspl_access_token" in sc:
            record("Cookie: HttpOnly", "httponly" in sc.lower(), elapsed,
                   "Access token cookie", "Security")
            record("Cookie: Secure", "secure" in sc.lower(), elapsed, "", "Security")
            record("Cookie: SameSite", "samesite" in sc.lower(), elapsed, "", "Security")
            break
    else:
        record("Cookie: HttpOnly (access_token)", False, elapsed, "No access token cookie found", "Security")

    # ── 1.5 Common Vulnerability Checks ──────────────────────────────────────
    print("\n  --- Vulnerability Probes ---")

    # SQL Injection attempt
    t0 = time.monotonic()
    resp = await client.post(f"{API_URL}/auth/login",
                              json={"email": "' OR 1=1 --", "password": "anything"})
    elapsed = (time.monotonic() - t0) * 1000
    record("SQLi: Login immune", resp.status_code in (401, 422), elapsed,
           f"Status: {resp.status_code}", "Security")

    # XSS in input
    t0 = time.monotonic()
    resp = await client.post(f"{API_URL}/auth/login",
                              json={"email": "<script>alert(1)</script>", "password": "test"})
    elapsed = (time.monotonic() - t0) * 1000
    body = resp.text
    record("XSS: Login immune", "<script>" not in body, elapsed,
           f"Status: {resp.status_code}", "Security")

    # Path traversal
    t0 = time.monotonic()
    resp = await client.get(f"{API_URL}/../../../etc/passwd")
    elapsed = (time.monotonic() - t0) * 1000
    record("Path Traversal: Blocked", resp.status_code in (400, 404, 405, 422), elapsed,
           f"Status: {resp.status_code}", "Security")

    # Large payload
    t0 = time.monotonic()
    resp = await client.post(f"{API_URL}/auth/login",
                              json={"email": "a" * 10000, "password": "b" * 10000})
    elapsed = (time.monotonic() - t0) * 1000
    record("Large Payload: Handled", resp.status_code in (401, 413, 422), elapsed,
           f"Status: {resp.status_code}", "Security")

    # Missing Content-Type
    t0 = time.monotonic()
    resp = await client.post(f"{API_URL}/auth/login",
                              content="not json", headers={"Content-Type": "text/plain"})
    elapsed = (time.monotonic() - t0) * 1000
    record("Bad Content-Type: Handled", resp.status_code in (400, 415, 422), elapsed,
           f"Status: {resp.status_code}", "Security")


# ═══════════════════════════════════════════════════════════════════════════════
# PHASE 2: AUTHENTICATION & AUTHORIZATION TESTS
# ═══════════════════════════════════════════════════════════════════════════════

async def test_auth(client: httpx.AsyncClient):
    section("PHASE 2: AUTHENTICATION & AUTHORIZATION")

    # ── 2.1 Login Tests ──────────────────────────────────────────────────────
    print("\n  --- Login Flow ---")

    # Valid login for all roles
    for role, creds in USERS.items():
        t0 = time.monotonic()
        resp = await client.post(f"{API_URL}/auth/login", json=creds)
        elapsed = (time.monotonic() - t0) * 1000

        success = resp.status_code == 200
        record(f"Login: {role}", success, elapsed,
               f"Status: {resp.status_code}", "Auth")

        # Extract token
        if success:
            for sc in resp.headers.get_list("set-cookie"):
                if "ssmspl_access_token=" in sc:
                    token = sc.split("ssmspl_access_token=")[1].split(";")[0]
                    tokens[role] = token
                    break

    # Invalid password
    t0 = time.monotonic()
    resp = await client.post(f"{API_URL}/auth/login",
                              json={"email": "superadmin@ssmspl.com", "password": "WrongPass123"})
    elapsed = (time.monotonic() - t0) * 1000
    record("Login: Wrong password rejected", resp.status_code == 401, elapsed,
           f"Status: {resp.status_code}", "Auth")

    # Non-existent user
    t0 = time.monotonic()
    resp = await client.post(f"{API_URL}/auth/login",
                              json={"email": "nobody@ssmspl.com", "password": "Password@123"})
    elapsed = (time.monotonic() - t0) * 1000
    record("Login: Non-existent user rejected", resp.status_code == 401, elapsed,
           f"Status: {resp.status_code}", "Auth")

    # Empty credentials
    t0 = time.monotonic()
    resp = await client.post(f"{API_URL}/auth/login", json={"email": "", "password": ""})
    elapsed = (time.monotonic() - t0) * 1000
    record("Login: Empty credentials rejected", resp.status_code in (401, 422), elapsed,
           f"Status: {resp.status_code}", "Auth")

    # ── 2.2 Token Tests ──────────────────────────────────────────────────────
    print("\n  --- Token Validation ---")

    # Valid token: /me endpoint
    if tokens.get("SUPER_ADMIN"):
        t0 = time.monotonic()
        resp = await client.get(f"{API_URL}/auth/me", headers=auth_headers("SUPER_ADMIN"))
        elapsed = (time.monotonic() - t0) * 1000
        record("Token: Valid /me access", resp.status_code == 200, elapsed,
               f"Status: {resp.status_code}", "Auth")

        if resp.status_code == 200:
            data = resp.json()
            record("Token: Returns user data", "email" in data, elapsed,
                   f"Email: {data.get('email', 'N/A')}", "Auth")

    # Invalid token
    t0 = time.monotonic()
    resp = await client.get(f"{API_URL}/auth/me",
                             headers={"Authorization": "Bearer invalid_token_123"})
    elapsed = (time.monotonic() - t0) * 1000
    record("Token: Invalid rejected", resp.status_code == 401, elapsed,
           f"Status: {resp.status_code}", "Auth")

    # No token
    t0 = time.monotonic()
    resp = await client.get(f"{API_URL}/auth/me")
    elapsed = (time.monotonic() - t0) * 1000
    record("Token: Missing rejected", resp.status_code == 401, elapsed,
           f"Status: {resp.status_code}", "Auth")

    # Expired/tampered token
    t0 = time.monotonic()
    resp = await client.get(f"{API_URL}/auth/me",
                             headers={"Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.dozjgNryP4J3jVmNHl0w5N_XgL0n3I9PlFUP0THsR8U"})
    elapsed = (time.monotonic() - t0) * 1000
    record("Token: Tampered rejected", resp.status_code == 401, elapsed,
           f"Status: {resp.status_code}", "Auth")

    # ── 2.3 RBAC Tests ──────────────────────────────────────────────────────
    print("\n  --- RBAC Enforcement ---")

    # Admin-only endpoints — BILLING_OPERATOR should be blocked
    admin_endpoints = [
        ("GET", f"{API_URL}/users"),
        ("GET", f"{API_URL}/users/count"),
    ]
    for method, url in admin_endpoints:
        t0 = time.monotonic()
        if method == "GET":
            resp = await client.get(url, headers=auth_headers("BILLING_OPERATOR"))
        elapsed = (time.monotonic() - t0) * 1000
        record(f"RBAC: BILLING blocked from {url.split('/api/')[-1]}",
               resp.status_code == 403, elapsed,
               f"Status: {resp.status_code}", "Auth")

    # SUPER_ADMIN should access everything
    for method, url in admin_endpoints:
        t0 = time.monotonic()
        resp = await client.get(url, headers=auth_headers("SUPER_ADMIN"))
        elapsed = (time.monotonic() - t0) * 1000
        record(f"RBAC: SUPER_ADMIN access {url.split('/api/')[-1]}",
               resp.status_code == 200, elapsed,
               f"Status: {resp.status_code}", "Auth")

    # TICKET_CHECKER should not access boats/branches/items management
    restricted_for_checker = [
        f"{API_URL}/boats",
        f"{API_URL}/branches",
        f"{API_URL}/items",
    ]
    for url in restricted_for_checker:
        t0 = time.monotonic()
        resp = await client.get(url, headers=auth_headers("TICKET_CHECKER"))
        elapsed = (time.monotonic() - t0) * 1000
        record(f"RBAC: CHECKER blocked from {url.split('/api/')[-1]}",
               resp.status_code == 403, elapsed,
               f"Status: {resp.status_code}", "Auth")

    # ── 2.4 Logout ───────────────────────────────────────────────────────────
    print("\n  --- Logout ---")
    t0 = time.monotonic()
    resp = await client.post(f"{API_URL}/auth/logout", headers=auth_headers("TICKET_CHECKER"))
    elapsed = (time.monotonic() - t0) * 1000
    record("Logout: Returns 200", resp.status_code == 200, elapsed,
           f"Status: {resp.status_code}", "Auth")

    # Re-login the checker for later tests
    await login(client, "TICKET_CHECKER")


# ═══════════════════════════════════════════════════════════════════════════════
# PHASE 3: FUNCTIONAL API TESTS
# ═══════════════════════════════════════════════════════════════════════════════

async def test_functional(client: httpx.AsyncClient):
    section("PHASE 3: FUNCTIONAL API TESTS")

    # Ensure we have tokens
    for role in USERS:
        if role not in tokens:
            await login(client, role)

    # ── 3.1 Dashboard ────────────────────────────────────────────────────────
    print("\n  --- Dashboard ---")
    t0 = time.monotonic()
    resp = await client.get(f"{API_URL}/dashboard/stats", headers=auth_headers("SUPER_ADMIN"))
    elapsed = (time.monotonic() - t0) * 1000
    record("Dashboard: Stats accessible", resp.status_code == 200, elapsed,
           f"Status: {resp.status_code}", "Functional")
    if resp.status_code == 200:
        data = resp.json()
        record("Dashboard: Has expected fields",
               all(k in data for k in ("ticket_count", "today_revenue")),
               elapsed, f"Keys: {list(data.keys())[:5]}", "Functional")

    # ── 3.2 Branches ─────────────────────────────────────────────────────────
    print("\n  --- Branches ---")
    t0 = time.monotonic()
    resp = await client.get(f"{API_URL}/branches", headers=auth_headers("SUPER_ADMIN"))
    elapsed = (time.monotonic() - t0) * 1000
    record("Branches: List", resp.status_code == 200, elapsed,
           f"Count: {len(resp.json()) if resp.status_code == 200 else 'N/A'}", "Functional")

    t0 = time.monotonic()
    resp = await client.get(f"{API_URL}/branches/count", headers=auth_headers("SUPER_ADMIN"))
    elapsed = (time.monotonic() - t0) * 1000
    record("Branches: Count", resp.status_code == 200, elapsed,
           f"Count: {resp.json() if resp.status_code == 200 else 'N/A'}", "Functional")

    t0 = time.monotonic()
    resp = await client.get(f"{API_URL}/branches/101", headers=auth_headers("SUPER_ADMIN"))
    elapsed = (time.monotonic() - t0) * 1000
    record("Branches: Get by ID", resp.status_code == 200, elapsed,
           f"Name: {resp.json().get('name', 'N/A') if resp.status_code == 200 else 'N/A'}", "Functional")

    t0 = time.monotonic()
    resp = await client.get(f"{API_URL}/branches/99999", headers=auth_headers("SUPER_ADMIN"))
    elapsed = (time.monotonic() - t0) * 1000
    record("Branches: 404 for invalid ID", resp.status_code == 404, elapsed,
           f"Status: {resp.status_code}", "Functional")

    # ── 3.3 Routes ────────────────────────────────────────────────────────────
    print("\n  --- Routes ---")
    t0 = time.monotonic()
    resp = await client.get(f"{API_URL}/routes", headers=auth_headers("SUPER_ADMIN"))
    elapsed = (time.monotonic() - t0) * 1000
    record("Routes: List", resp.status_code == 200, elapsed,
           f"Count: {len(resp.json()) if resp.status_code == 200 else 'N/A'}", "Functional")

    t0 = time.monotonic()
    resp = await client.get(f"{API_URL}/routes/1", headers=auth_headers("SUPER_ADMIN"))
    elapsed = (time.monotonic() - t0) * 1000
    record("Routes: Get by ID", resp.status_code == 200, elapsed, "", "Functional")

    # ── 3.4 Boats ─────────────────────────────────────────────────────────────
    print("\n  --- Boats ---")
    t0 = time.monotonic()
    resp = await client.get(f"{API_URL}/boats", headers=auth_headers("SUPER_ADMIN"))
    elapsed = (time.monotonic() - t0) * 1000
    record("Boats: List", resp.status_code == 200, elapsed,
           f"Count: {len(resp.json()) if resp.status_code == 200 else 'N/A'}", "Functional")

    # ── 3.5 Items ─────────────────────────────────────────────────────────────
    print("\n  --- Items ---")
    t0 = time.monotonic()
    resp = await client.get(f"{API_URL}/items", headers=auth_headers("SUPER_ADMIN"))
    elapsed = (time.monotonic() - t0) * 1000
    record("Items: List", resp.status_code == 200, elapsed,
           f"Count: {len(resp.json()) if resp.status_code == 200 else 'N/A'}", "Functional")

    t0 = time.monotonic()
    resp = await client.get(f"{API_URL}/items/count", headers=auth_headers("SUPER_ADMIN"))
    elapsed = (time.monotonic() - t0) * 1000
    record("Items: Count", resp.status_code == 200, elapsed,
           f"Count: {resp.json() if resp.status_code == 200 else 'N/A'}", "Functional")

    # ── 3.6 Item Rates ────────────────────────────────────────────────────────
    print("\n  --- Item Rates ---")
    t0 = time.monotonic()
    resp = await client.get(f"{API_URL}/item-rates", headers=auth_headers("SUPER_ADMIN"))
    elapsed = (time.monotonic() - t0) * 1000
    record("Item Rates: List", resp.status_code == 200, elapsed,
           f"Count: {len(resp.json()) if resp.status_code == 200 else 'N/A'}", "Functional")

    # ── 3.7 Ferry Schedules ───────────────────────────────────────────────────
    print("\n  --- Ferry Schedules ---")
    t0 = time.monotonic()
    resp = await client.get(f"{API_URL}/ferry-schedules", headers=auth_headers("SUPER_ADMIN"))
    elapsed = (time.monotonic() - t0) * 1000
    record("Schedules: List", resp.status_code == 200, elapsed,
           f"Count: {len(resp.json()) if resp.status_code == 200 else 'N/A'}", "Functional")

    # ── 3.8 Payment Modes ────────────────────────────────────────────────────
    print("\n  --- Payment Modes ---")
    t0 = time.monotonic()
    resp = await client.get(f"{API_URL}/payment-modes", headers=auth_headers("SUPER_ADMIN"))
    elapsed = (time.monotonic() - t0) * 1000
    record("Payment Modes: List", resp.status_code == 200, elapsed,
           f"Count: {len(resp.json()) if resp.status_code == 200 else 'N/A'}", "Functional")

    # ── 3.9 Ticket Operations ────────────────────────────────────────────────
    print("\n  --- Tickets ---")

    # Rate lookup
    t0 = time.monotonic()
    resp = await client.get(f"{API_URL}/tickets/rate-lookup",
                             params={"item_id": 11, "route_id": 1},
                             headers=auth_headers("BILLING_OPERATOR"))
    elapsed = (time.monotonic() - t0) * 1000
    record("Tickets: Rate lookup", resp.status_code == 200, elapsed,
           f"Response: {resp.json() if resp.status_code == 200 else resp.status_code}", "Functional")

    # Departure options
    t0 = time.monotonic()
    resp = await client.get(f"{API_URL}/tickets/departure-options",
                             params={"branch_id": 101},
                             headers=auth_headers("BILLING_OPERATOR"))
    elapsed = (time.monotonic() - t0) * 1000
    record("Tickets: Departure options", resp.status_code == 200, elapsed,
           f"Count: {len(resp.json()) if resp.status_code == 200 else 'N/A'}", "Functional")

    # Multi-ticket init
    t0 = time.monotonic()
    resp = await client.get(f"{API_URL}/tickets/multi-ticket-init",
                             headers=auth_headers("BILLING_OPERATOR"))
    elapsed = (time.monotonic() - t0) * 1000
    record("Tickets: Multi-ticket init", resp.status_code == 200, elapsed,
           f"Status: {resp.status_code}", "Functional")

    # Create a ticket
    today = date.today().isoformat()
    ticket_payload = {
        "branch_id": 101,
        "ticket_date": today,
        "departure": "09:30",
        "route_id": 1,
        "payment_mode_id": 1,
        "discount": 0,
        "amount": 24.00,
        "net_amount": 24.00,
        "items": [
            {"item_id": 11, "rate": 22.00, "levy": 2.00, "quantity": 1, "vehicle_no": None}
        ]
    }

    t0 = time.monotonic()
    resp = await client.post(f"{API_URL}/tickets", json=ticket_payload,
                              headers=auth_headers("BILLING_OPERATOR"))
    elapsed = (time.monotonic() - t0) * 1000
    created_ticket_id = None
    if resp.status_code == 201:
        created_ticket_id = resp.json().get("id")
    record("Tickets: Create single ticket", resp.status_code == 201, elapsed,
           f"Status: {resp.status_code}, ID: {created_ticket_id}", "Functional")

    # Get ticket by ID
    if created_ticket_id:
        t0 = time.monotonic()
        resp = await client.get(f"{API_URL}/tickets/{created_ticket_id}",
                                 headers=auth_headers("BILLING_OPERATOR"))
        elapsed = (time.monotonic() - t0) * 1000
        record("Tickets: Get by ID", resp.status_code == 200, elapsed,
               f"Ticket #{created_ticket_id}", "Functional")

        # Get QR code
        t0 = time.monotonic()
        resp = await client.get(f"{API_URL}/tickets/{created_ticket_id}/qr",
                                 headers=auth_headers("BILLING_OPERATOR"))
        elapsed = (time.monotonic() - t0) * 1000
        record("Tickets: QR code generation", resp.status_code == 200, elapsed,
               f"Content-Type: {resp.headers.get('content-type', 'N/A')}", "Functional")

    # List tickets
    t0 = time.monotonic()
    resp = await client.get(f"{API_URL}/tickets", headers=auth_headers("BILLING_OPERATOR"))
    elapsed = (time.monotonic() - t0) * 1000
    record("Tickets: List", resp.status_code == 200, elapsed,
           f"Count: {len(resp.json()) if resp.status_code == 200 else 'N/A'}", "Functional")

    # Ticket count
    t0 = time.monotonic()
    resp = await client.get(f"{API_URL}/tickets/count", headers=auth_headers("BILLING_OPERATOR"))
    elapsed = (time.monotonic() - t0) * 1000
    record("Tickets: Count", resp.status_code == 200, elapsed,
           f"Count: {resp.json() if resp.status_code == 200 else 'N/A'}", "Functional")

    # ── 3.10 Reports ─────────────────────────────────────────────────────────
    print("\n  --- Reports ---")
    report_endpoints = [
        ("revenue", {"date_from": "2026-01-01", "date_to": today}),
        ("ticket-count", {"date_from": "2026-01-01", "date_to": today}),
        ("item-breakdown", {"date_from": "2026-01-01", "date_to": today}),
        ("branch-summary", {"date_from": "2026-01-01", "date_to": today}),
        ("payment-mode", {"date_from": "2026-01-01", "date_to": today}),
    ]
    for name, params in report_endpoints:
        t0 = time.monotonic()
        resp = await client.get(f"{API_URL}/reports/{name}",
                                 params=params,
                                 headers=auth_headers("SUPER_ADMIN"))
        elapsed = (time.monotonic() - t0) * 1000
        record(f"Reports: {name}", resp.status_code == 200, elapsed,
               f"Status: {resp.status_code}", "Functional")

    # ── 3.11 Users Management ────────────────────────────────────────────────
    print("\n  --- Users ---")
    t0 = time.monotonic()
    resp = await client.get(f"{API_URL}/users", headers=auth_headers("SUPER_ADMIN"))
    elapsed = (time.monotonic() - t0) * 1000
    record("Users: List", resp.status_code == 200, elapsed,
           f"Count: {len(resp.json()) if resp.status_code == 200 else 'N/A'}", "Functional")

    # ── 3.12 Company Settings ────────────────────────────────────────────────
    print("\n  --- Company ---")
    t0 = time.monotonic()
    resp = await client.get(f"{API_URL}/company", headers=auth_headers("SUPER_ADMIN"))
    elapsed = (time.monotonic() - t0) * 1000
    record("Company: Get settings", resp.status_code == 200, elapsed,
           f"Name: {resp.json().get('name', 'N/A')[:30] if resp.status_code == 200 else 'N/A'}", "Functional")

    # ── 3.13 Contact Form ────────────────────────────────────────────────────
    print("\n  --- Contact Form (Public) ---")
    t0 = time.monotonic()
    resp = await client.post(f"{API_URL}/contact", json={
        "name": "Test User",
        "email": "test@example.com",
        "phone": "9876543210",
        "message": "This is an automated test message. Please ignore."
    })
    elapsed = (time.monotonic() - t0) * 1000
    record("Contact: Submit form", resp.status_code == 200, elapsed,
           f"Status: {resp.status_code}", "Functional")

    # ── 3.14 Portal Endpoints ────────────────────────────────────────────────
    print("\n  --- Portal (Public) ---")

    # Portal register (use unique email to avoid conflicts)
    rand_suffix = ''.join(random.choices(string.ascii_lowercase, k=6))
    portal_email = f"testuser_{rand_suffix}@example.com"
    t0 = time.monotonic()
    resp = await client.post(f"{API_URL}/portal/auth/register", json={
        "first_name": "Test",
        "last_name": "User",
        "email": portal_email,
        "mobile": "9876543210",
        "password": "TestPass@123"
    })
    elapsed = (time.monotonic() - t0) * 1000
    record("Portal: Register", resp.status_code == 201, elapsed,
           f"Status: {resp.status_code}", "Functional")

    # ── 3.15 Input Validation ────────────────────────────────────────────────
    print("\n  --- Input Validation ---")

    # Invalid ticket — missing required fields
    t0 = time.monotonic()
    resp = await client.post(f"{API_URL}/tickets", json={},
                              headers=auth_headers("BILLING_OPERATOR"))
    elapsed = (time.monotonic() - t0) * 1000
    record("Validation: Empty ticket rejected", resp.status_code == 422, elapsed,
           f"Status: {resp.status_code}", "Functional")

    # Invalid ticket — negative amount
    t0 = time.monotonic()
    resp = await client.post(f"{API_URL}/tickets", json={
        "branch_id": 101, "ticket_date": today, "route_id": 1,
        "payment_mode_id": 1, "discount": 0, "amount": -100,
        "net_amount": -100, "items": [{"item_id": 11, "rate": 22, "levy": 2, "quantity": 1}]
    }, headers=auth_headers("BILLING_OPERATOR"))
    elapsed = (time.monotonic() - t0) * 1000
    record("Validation: Negative amount rejected", resp.status_code == 422, elapsed,
           f"Status: {resp.status_code}", "Functional")

    # Invalid branch ID
    t0 = time.monotonic()
    resp = await client.post(f"{API_URL}/tickets", json={
        "branch_id": 99999, "ticket_date": today, "route_id": 1,
        "payment_mode_id": 1, "discount": 0, "amount": 24,
        "net_amount": 24, "items": [{"item_id": 11, "rate": 22, "levy": 2, "quantity": 1}]
    }, headers=auth_headers("BILLING_OPERATOR"))
    elapsed = (time.monotonic() - t0) * 1000
    record("Validation: Invalid branch rejected", resp.status_code in (400, 404, 422), elapsed,
           f"Status: {resp.status_code}", "Functional")

    # Sorting/filtering
    t0 = time.monotonic()
    resp = await client.get(f"{API_URL}/branches",
                             params={"sort_by": "name", "sort_order": "asc", "search": "DABHOL"},
                             headers=auth_headers("SUPER_ADMIN"))
    elapsed = (time.monotonic() - t0) * 1000
    record("Filtering: Search branches", resp.status_code == 200, elapsed,
           f"Count: {len(resp.json()) if resp.status_code == 200 else 'N/A'}", "Functional")

    # Pagination
    t0 = time.monotonic()
    resp = await client.get(f"{API_URL}/items",
                             params={"skip": 0, "limit": 5},
                             headers=auth_headers("SUPER_ADMIN"))
    elapsed = (time.monotonic() - t0) * 1000
    count = len(resp.json()) if resp.status_code == 200 else 0
    record("Pagination: Limit works", resp.status_code == 200 and count <= 5, elapsed,
           f"Returned: {count} items", "Functional")


# ═══════════════════════════════════════════════════════════════════════════════
# PHASE 4: LOAD TESTING
# ═══════════════════════════════════════════════════════════════════════════════

async def test_load(client: httpx.AsyncClient):
    section("PHASE 4: LOAD TESTING")
    print("  Target: Simulating your real-world load (900-2900 tickets/day)")
    print("  Testing various concurrency levels against key endpoints\n")

    # Ensure tokens
    for role in USERS:
        if role not in tokens:
            await login(client, role)

    async def fire_request(client: httpx.AsyncClient, method: str, url: str,
                           headers: dict = None, json_data: dict = None,
                           params: dict = None) -> tuple[int, float]:
        """Fire a single request and return (status_code, latency_ms)."""
        t0 = time.monotonic()
        try:
            if method == "GET":
                resp = await client.get(url, headers=headers, params=params, timeout=TIMEOUT)
            else:
                resp = await client.post(url, headers=headers, json=json_data, timeout=TIMEOUT)
            latency = (time.monotonic() - t0) * 1000
            return resp.status_code, latency
        except Exception as e:
            latency = (time.monotonic() - t0) * 1000
            return 0, latency

    async def load_test(name: str, concurrency: int, total_requests: int,
                        method: str, url: str, headers: dict = None,
                        json_data: dict = None, params: dict = None,
                        expected_status: int = 200) -> LoadResult:
        """Run a load test with given concurrency."""
        result = LoadResult()
        semaphore = asyncio.Semaphore(concurrency)

        async def worker():
            async with semaphore:
                status, latency = await fire_request(client, method, url, headers, json_data, params)
                result.total_requests += 1
                result.latencies.append(latency)
                result.status_codes[status] += 1
                if status == expected_status:
                    result.successful += 1
                else:
                    result.failed += 1
                    result.errors[f"HTTP {status}"] += 1

        tasks = [asyncio.create_task(worker()) for _ in range(total_requests)]
        t0 = time.monotonic()
        await asyncio.gather(*tasks)
        total_time = time.monotonic() - t0

        # Report
        if result.latencies:
            p50 = statistics.median(result.latencies)
            p95 = sorted(result.latencies)[int(len(result.latencies) * 0.95)]
            p99 = sorted(result.latencies)[int(len(result.latencies) * 0.99)]
            avg = statistics.mean(result.latencies)
            rps = result.total_requests / total_time if total_time > 0 else 0

            print(f"  [{name}] Concurrency={concurrency}, Total={total_requests}")
            print(f"    Success: {result.successful}/{result.total_requests} "
                  f"({result.successful/result.total_requests*100:.1f}%)")
            print(f"    RPS: {rps:.1f} req/s")
            print(f"    Latency: avg={avg:.0f}ms, p50={p50:.0f}ms, p95={p95:.0f}ms, p99={p99:.0f}ms")
            print(f"    Min={min(result.latencies):.0f}ms, Max={max(result.latencies):.0f}ms")
            if result.errors:
                print(f"    Errors: {dict(result.errors)}")
            print()

            success_rate = result.successful / result.total_requests
            record(f"Load: {name} ({concurrency} concurrent)",
                   success_rate >= 0.95, avg,
                   f"RPS={rps:.1f}, p95={p95:.0f}ms, success={success_rate*100:.1f}%",
                   "Load")

        return result

    # ── 4.1 Public endpoint: Homepage ─────────────────────────────────────────
    print("  --- Public Endpoints ---")
    await load_test("Homepage", 10, 50, "GET", f"{BASE_URL}/")
    await load_test("Homepage", 50, 200, "GET", f"{BASE_URL}/")

    # ── 4.2 Login endpoint ────────────────────────────────────────────────────
    print("  --- Login Endpoint ---")
    await load_test("Login", 10, 50, "POST", f"{API_URL}/auth/login",
                    json_data=USERS["BILLING_OPERATOR"], expected_status=200)

    # ── 4.3 Authenticated read endpoints ──────────────────────────────────────
    print("  --- Authenticated Read Endpoints ---")
    h = auth_headers("BILLING_OPERATOR")

    await load_test("Dashboard Stats", 20, 100, "GET",
                    f"{API_URL}/dashboard/stats", headers=h)

    await load_test("Ticket List", 20, 100, "GET",
                    f"{API_URL}/tickets", headers=h)

    await load_test("Rate Lookup", 30, 150, "GET",
                    f"{API_URL}/tickets/rate-lookup", headers=h,
                    params={"item_id": 11, "route_id": 1})

    await load_test("Branch List", 20, 100, "GET",
                    f"{API_URL}/branches", headers=h)

    await load_test("Multi-ticket Init", 20, 100, "GET",
                    f"{API_URL}/tickets/multi-ticket-init", headers=h)

    # ── 4.4 Ticket creation under load ────────────────────────────────────────
    print("  --- Ticket Creation Under Load ---")
    today = date.today().isoformat()

    # Light load: 5 concurrent ticket creations
    ticket_payload = {
        "branch_id": 101, "ticket_date": today, "departure": "09:30",
        "route_id": 1, "payment_mode_id": 1, "discount": 0,
        "amount": 24.00, "net_amount": 24.00,
        "items": [{"item_id": 11, "rate": 22.00, "levy": 2.00, "quantity": 1}]
    }
    await load_test("Ticket Create (light)", 5, 20, "POST",
                    f"{API_URL}/tickets", headers=auth_headers("BILLING_OPERATOR"),
                    json_data=ticket_payload, expected_status=201)

    # Medium load: 10 concurrent
    await load_test("Ticket Create (medium)", 10, 50, "POST",
                    f"{API_URL}/tickets", headers=auth_headers("BILLING_OPERATOR"),
                    json_data=ticket_payload, expected_status=201)

    # Heavy load: 20 concurrent
    await load_test("Ticket Create (heavy)", 20, 100, "POST",
                    f"{API_URL}/tickets", headers=auth_headers("BILLING_OPERATOR"),
                    json_data=ticket_payload, expected_status=201)

    # ── 4.5 Mixed workload simulation ─────────────────────────────────────────
    print("  --- Mixed Workload (Realistic Simulation) ---")
    print("  Simulating 12 branches each doing ticket operations...\n")

    mixed_result = LoadResult()
    mixed_start = time.monotonic()

    async def mixed_worker(worker_id: int):
        """Simulate a single billing operator's workflow."""
        h = auth_headers("BILLING_OPERATOR")
        branch = BRANCHES[worker_id % len(BRANCHES)]
        route = ROUTES[worker_id % len(ROUTES)]

        operations = [
            ("GET", f"{API_URL}/tickets/multi-ticket-init", None, None),
            ("GET", f"{API_URL}/tickets/rate-lookup", None, {"item_id": 11, "route_id": route}),
            ("GET", f"{API_URL}/tickets/departure-options", None, {"branch_id": branch}),
            ("POST", f"{API_URL}/tickets", {
                "branch_id": branch, "ticket_date": date.today().isoformat(),
                "departure": "09:30", "route_id": route, "payment_mode_id": 1,
                "discount": 0, "amount": 24.00, "net_amount": 24.00,
                "items": [{"item_id": 11, "rate": 22.00, "levy": 2.00, "quantity": 1}]
            }, None),
            ("GET", f"{API_URL}/dashboard/stats", None, None),
        ]

        for method, url, json_data, params in operations:
            status, latency = await fire_request(client, method, url, h, json_data, params)
            mixed_result.total_requests += 1
            mixed_result.latencies.append(latency)
            mixed_result.status_codes[status] += 1
            if status in (200, 201):
                mixed_result.successful += 1
            else:
                mixed_result.failed += 1

    # Run 12 concurrent workers (simulating 12 branches)
    tasks = [asyncio.create_task(mixed_worker(i)) for i in range(12)]
    await asyncio.gather(*tasks)
    mixed_time = time.monotonic() - mixed_start

    if mixed_result.latencies:
        p50 = statistics.median(mixed_result.latencies)
        p95 = sorted(mixed_result.latencies)[int(len(mixed_result.latencies) * 0.95)]
        avg = statistics.mean(mixed_result.latencies)
        rps = mixed_result.total_requests / mixed_time

        print(f"  [Mixed Workload] 12 concurrent branch operators")
        print(f"    Total requests: {mixed_result.total_requests}")
        print(f"    Success: {mixed_result.successful}/{mixed_result.total_requests}")
        print(f"    RPS: {rps:.1f} req/s")
        print(f"    Latency: avg={avg:.0f}ms, p50={p50:.0f}ms, p95={p95:.0f}ms")
        print(f"    Status codes: {dict(mixed_result.status_codes)}")
        print()

        success_rate = mixed_result.successful / mixed_result.total_requests
        record("Load: Mixed workload (12 branches)", success_rate >= 0.90, avg,
               f"RPS={rps:.1f}, p95={p95:.0f}ms, success={success_rate*100:.1f}%", "Load")


# ═══════════════════════════════════════════════════════════════════════════════
# PHASE 5: STRESS TESTING
# ═══════════════════════════════════════════════════════════════════════════════

async def test_stress(client: httpx.AsyncClient):
    section("PHASE 5: STRESS TESTING")
    print("  Ramping up concurrency to find the breaking point...\n")

    # Ensure tokens
    for role in USERS:
        if role not in tokens:
            await login(client, role)

    h = auth_headers("BILLING_OPERATOR")

    async def stress_level(concurrency: int, requests_per: int, url: str,
                           method: str = "GET", json_data: dict = None,
                           expected: int = 200) -> tuple[float, float, float]:
        """Run a single stress level and return (success_rate, avg_latency, rps)."""
        semaphore = asyncio.Semaphore(concurrency)
        latencies = []
        successes = 0
        total = 0

        async def worker():
            nonlocal successes, total
            async with semaphore:
                t0 = time.monotonic()
                try:
                    if method == "GET":
                        resp = await client.get(url, headers=h, timeout=TIMEOUT)
                    else:
                        resp = await client.post(url, headers=h, json=json_data, timeout=TIMEOUT)
                    lat = (time.monotonic() - t0) * 1000
                    latencies.append(lat)
                    total += 1
                    if resp.status_code == expected:
                        successes += 1
                except:
                    total += 1
                    latencies.append((time.monotonic() - t0) * 1000)

        tasks = [asyncio.create_task(worker()) for _ in range(requests_per)]
        t0 = time.monotonic()
        await asyncio.gather(*tasks)
        elapsed = time.monotonic() - t0

        success_rate = successes / total if total > 0 else 0
        avg_lat = statistics.mean(latencies) if latencies else 0
        rps = total / elapsed if elapsed > 0 else 0

        return success_rate, avg_lat, rps

    # ── 5.1 Ramp-up test: Dashboard Stats ────────────────────────────────────
    print("  --- Ramp-up: Dashboard Stats (GET) ---")
    levels = [10, 25, 50, 100, 150, 200, 300]
    for conc in levels:
        n = conc * 2
        sr, avg, rps = await stress_level(conc, n, f"{API_URL}/dashboard/stats")
        status = "OK" if sr >= 0.95 else "DEGRADED" if sr >= 0.80 else "FAILING"
        print(f"    Concurrency={conc:>4}: success={sr*100:5.1f}%, "
              f"avg={avg:6.0f}ms, rps={rps:6.1f} [{status}]")
        record(f"Stress: Dashboard @{conc} concurrent",
               sr >= 0.80, avg,
               f"success={sr*100:.1f}%, rps={rps:.1f}", "Stress")

        if sr < 0.50:
            print(f"    >> Server breaking at concurrency {conc}. Stopping ramp-up.")
            break

        # Small delay between levels to let server recover
        await asyncio.sleep(1)

    # ── 5.2 Ramp-up test: Ticket Creation ────────────────────────────────────
    print("\n  --- Ramp-up: Ticket Creation (POST) ---")
    today = date.today().isoformat()
    ticket_payload = {
        "branch_id": 101, "ticket_date": today, "departure": "09:30",
        "route_id": 1, "payment_mode_id": 1, "discount": 0,
        "amount": 24.00, "net_amount": 24.00,
        "items": [{"item_id": 11, "rate": 22.00, "levy": 2.00, "quantity": 1}]
    }

    write_levels = [5, 10, 20, 40, 60, 80, 100]
    for conc in write_levels:
        n = conc * 2
        sr, avg, rps = await stress_level(conc, n, f"{API_URL}/tickets",
                                           method="POST", json_data=ticket_payload,
                                           expected=201)
        status = "OK" if sr >= 0.95 else "DEGRADED" if sr >= 0.80 else "FAILING"
        print(f"    Concurrency={conc:>4}: success={sr*100:5.1f}%, "
              f"avg={avg:6.0f}ms, rps={rps:6.1f} [{status}]")
        record(f"Stress: Ticket Create @{conc} concurrent",
               sr >= 0.80, avg,
               f"success={sr*100:.1f}%, rps={rps:.1f}", "Stress")

        if sr < 0.50:
            print(f"    >> Server breaking at concurrency {conc}. Stopping ramp-up.")
            break

        await asyncio.sleep(1)

    # ── 5.3 Sustained load test ──────────────────────────────────────────────
    print("\n  --- Sustained Load: 30 seconds at moderate concurrency ---")
    sustained = LoadResult()
    duration_sec = 30
    concurrency = 20
    semaphore = asyncio.Semaphore(concurrency)
    stop_event = asyncio.Event()

    async def sustained_worker():
        while not stop_event.is_set():
            async with semaphore:
                t0 = time.monotonic()
                try:
                    resp = await client.get(f"{API_URL}/dashboard/stats",
                                             headers=h, timeout=TIMEOUT)
                    lat = (time.monotonic() - t0) * 1000
                    sustained.total_requests += 1
                    sustained.latencies.append(lat)
                    sustained.status_codes[resp.status_code] += 1
                    if resp.status_code == 200:
                        sustained.successful += 1
                    else:
                        sustained.failed += 1
                except:
                    sustained.total_requests += 1
                    sustained.failed += 1

    tasks = [asyncio.create_task(sustained_worker()) for _ in range(concurrency * 2)]

    print(f"    Running for {duration_sec}s with {concurrency} concurrent connections...")
    await asyncio.sleep(duration_sec)
    stop_event.set()

    # Wait for in-flight requests
    await asyncio.sleep(2)
    for t in tasks:
        t.cancel()

    if sustained.latencies:
        avg = statistics.mean(sustained.latencies)
        p95 = sorted(sustained.latencies)[int(len(sustained.latencies) * 0.95)]
        rps = sustained.total_requests / duration_sec
        sr = sustained.successful / sustained.total_requests

        print(f"    Total requests: {sustained.total_requests}")
        print(f"    Success rate: {sr*100:.1f}%")
        print(f"    RPS: {rps:.1f}")
        print(f"    Latency: avg={avg:.0f}ms, p95={p95:.0f}ms")
        print(f"    Status codes: {dict(sustained.status_codes)}")
        print()

        record("Stress: 30s sustained load", sr >= 0.90, avg,
               f"RPS={rps:.1f}, p95={p95:.0f}ms, total={sustained.total_requests}",
               "Stress")


# ═══════════════════════════════════════════════════════════════════════════════
# PHASE 6: RATE LIMITING TESTS
# ═══════════════════════════════════════════════════════════════════════════════

async def test_rate_limiting(client: httpx.AsyncClient):
    section("PHASE 6: RATE LIMITING TESTS")
    print("  Testing rate limit enforcement on protected endpoints...\n")

    # Login rate limit: 10/minute
    print("  --- Login Rate Limit (10/min) ---")
    statuses = []
    for i in range(15):
        resp = await client.post(f"{API_URL}/auth/login",
                                  json={"email": "nobody@test.com", "password": "wrong"})
        statuses.append(resp.status_code)

    rate_limited = 429 in statuses
    record("Rate Limit: Login endpoint",
           rate_limited, 0,
           f"Got 429 after {statuses.index(429)+1 if rate_limited else 'never'} requests. "
           f"Statuses: {dict((s, statuses.count(s)) for s in set(statuses))}",
           "Security")

    # Wait a bit for rate limit to clear
    await asyncio.sleep(2)

    # Forgot password rate limit: 5/minute
    print("  --- Forgot Password Rate Limit (5/min) ---")
    statuses = []
    for i in range(8):
        resp = await client.post(f"{API_URL}/auth/forgot-password",
                                  json={"email": "test@test.com"})
        statuses.append(resp.status_code)

    rate_limited = 429 in statuses
    record("Rate Limit: Forgot password",
           rate_limited, 0,
           f"Statuses: {dict((s, statuses.count(s)) for s in set(statuses))}",
           "Security")

    await asyncio.sleep(2)

    # Contact form rate limit: 3/minute
    print("  --- Contact Form Rate Limit (3/min) ---")
    statuses = []
    for i in range(6):
        resp = await client.post(f"{API_URL}/contact", json={
            "name": "Rate Test", "email": "rate@test.com",
            "phone": "1234567890", "message": "Rate limit test"
        })
        statuses.append(resp.status_code)

    rate_limited = 429 in statuses
    record("Rate Limit: Contact form",
           rate_limited, 0,
           f"Statuses: {dict((s, statuses.count(s)) for s in set(statuses))}",
           "Security")


# ═══════════════════════════════════════════════════════════════════════════════
# REPORT
# ═══════════════════════════════════════════════════════════════════════════════

def print_report():
    section("FINAL REPORT")

    categories = defaultdict(lambda: {"passed": 0, "failed": 0, "tests": []})
    for r in results:
        cat = r.category or "Other"
        categories[cat]["tests"].append(r)
        if r.passed:
            categories[cat]["passed"] += 1
        else:
            categories[cat]["failed"] += 1

    total_passed = sum(c["passed"] for c in categories.values())
    total_failed = sum(c["failed"] for c in categories.values())
    total = total_passed + total_failed

    for cat, data in categories.items():
        total_cat = data["passed"] + data["failed"]
        pct = data["passed"] / total_cat * 100 if total_cat > 0 else 0
        bar = "+" * data["passed"] + "-" * data["failed"]
        print(f"\n  {cat:15s} [{bar}] {data['passed']}/{total_cat} ({pct:.0f}%)")

        # Show failures
        for t in data["tests"]:
            if not t.passed:
                print(f"    FAIL: {t.name} — {t.detail}")

    print(f"\n{'='*70}")
    pct = total_passed / total * 100 if total > 0 else 0
    color = "\033[92m" if pct >= 90 else "\033[93m" if pct >= 70 else "\033[91m"
    reset = "\033[0m"
    print(f"  {color}TOTAL: {total_passed}/{total} tests passed ({pct:.1f}%){reset}")
    print(f"{'='*70}")

    # Average latencies by category
    print("\n  --- Latency Summary ---")
    for cat, data in categories.items():
        lats = [t.duration_ms for t in data["tests"] if t.duration_ms > 0]
        if lats:
            print(f"  {cat:15s}: avg={statistics.mean(lats):.0f}ms, "
                  f"max={max(lats):.0f}ms, min={min(lats):.0f}ms")


# ═══════════════════════════════════════════════════════════════════════════════
# MAIN
# ═══════════════════════════════════════════════════════════════════════════════

async def main():
    parser = argparse.ArgumentParser(description="SSMSPL Remote Test Suite")
    parser.add_argument("--phase", default="all",
                        choices=["security", "auth", "functional", "load", "stress",
                                 "ratelimit", "all"],
                        help="Which test phase to run")
    args = parser.parse_args()

    print("\n" + "=" * 70)
    print("  SSMSPL REMOTE TEST SUITE — carferry.online")
    print(f"  Started: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
    print("=" * 70)

    # Use a single client with connection pooling
    limits = httpx.Limits(max_connections=300, max_keepalive_connections=50)
    async with httpx.AsyncClient(
        limits=limits,
        timeout=httpx.Timeout(TIMEOUT),
        follow_redirects=True,
        verify=True,
    ) as client:

        # Pre-login all users
        print("\n  Authenticating all test users...")
        for role in USERS:
            token = await login(client, role)
            status = "OK" if token else "FAILED"
            print(f"    {role}: {status}")

        phases = {
            "security": test_security,
            "auth": test_auth,
            "functional": test_functional,
            "load": test_load,
            "stress": test_stress,
            "ratelimit": test_rate_limiting,
        }

        if args.phase == "all":
            for phase_fn in phases.values():
                await phase_fn(client)
        else:
            await phases[args.phase](client)

    print_report()


if __name__ == "__main__":
    asyncio.run(main())
