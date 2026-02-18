# SSMSPL – Ferry Boat Ticketing System
Suvarnadurga Shipping & Marine Services Pvt. Ltd.

## Quick Start
See `docs/plans/` for implementation details.

### Backend
```bash
cd backend
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env.development
uvicorn app.main:app --reload --env-file .env.development
```

### Frontend
```bash
cd frontend
npm install
cp .env.local.example .env.local
npm run dev
```
