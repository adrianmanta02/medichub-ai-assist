# How to Run MediChub AI Assist

This guide will help you set up and run the application.

## Prerequisites

- Node.js (v18 or higher recommended)
- npm or yarn
- A Supabase account (for database and authentication)

## Step 1: Install Dependencies

### Frontend Dependencies
```bash
npm install
```

### Backend Server Dependencies
```bash
cd server
npm install
cd ..
```

## Step 2: Set Up Environment Variables

### Frontend Environment Variables

Create a `.env` file in the **root directory** with your Supabase credentials:

```env
VITE_SUPABASE_URL=your_supabase_project_url
VITE_SUPABASE_PUBLISHABLE_KEY=your_supabase_anon_key
```

**How to get Supabase credentials:**
1. Go to your Supabase project dashboard
2. Navigate to Settings → API
3. Copy the "Project URL" → `VITE_SUPABASE_URL`
4. Copy the "anon public" key → `VITE_SUPABASE_PUBLISHABLE_KEY`

### Backend Server Environment Variables

Create a `.env` file in the **`server/` directory**:

```env
# Required
PORT=3001
PLACES_RADIUS_METERS=3000

# Optional - External Services (only if you want to use them)
# GEOAPIFY_API_KEY=pk.your_geoapify_key_here
# GOOGLE_PLACES_API_KEY=your_google_places_key_here

# Optional - LLM Providers (only if you want to use them)
# LLM_PROVIDER=ollama
# OLLAMA_API_URL=http://localhost:11434/api/generate
# OLLAMA_MODEL=llama3
# HF_API_URL=https://api-inference.huggingface.co/models/your-model
# HF_API_KEY=xxxx
```

**Note:** The app will work with just the basic configuration. External services are optional.

## Step 3: Set Up Supabase Database

### Option A: Using Supabase CLI (Recommended)

If you have Supabase CLI installed:

```bash
# Link to your Supabase project
supabase link --project-ref your-project-ref

# Run migrations
supabase db push
```

### Option B: Manual Setup via Supabase Dashboard

1. Go to your Supabase project dashboard
2. Navigate to SQL Editor
3. Run the migration files in order:
   - `supabase/migrations/20251108112442_a363a766-777b-498e-886b-2868db8fa173.sql`
   - `supabase/migrations/20251108112639_ee23a568-ce19-4fb2-9f06-ab5126648b9b.sql`
   - `supabase/migrations/20251109123000_wait_times_enhancements.sql`

## Step 4: Run the Application

### Terminal 1: Start the Backend Server

```bash
# From the root directory
cd server
node index.js
```

You should see:
```
Server running on http://localhost:3001
```

### Terminal 2: Start the Frontend Development Server

```bash
# From the root directory
npm run dev
```

You should see:
```
VITE v5.x.x  ready in xxx ms

➜  Local:   http://localhost:5173/
➜  Network: use --host to expose
```

## Step 5: Open the Application

Open your browser and navigate to:
```
http://localhost:5173
```

## Troubleshooting

### Port Already in Use

If port 3001 is already in use (backend):
```bash
# Windows PowerShell
Get-Process -Id (Get-NetTCPConnection -LocalPort 3001).OwningProcess | Stop-Process

# Or change the port in server/.env
PORT=3002
```

If port 5173 is already in use (frontend):
- Vite will automatically try the next available port
- Or specify a different port: `npm run dev --port 5174`

### Supabase Connection Errors

- Verify your `.env` file has the correct Supabase URL and key
- Check that your Supabase project is active
- Ensure migrations have been run

### "Failed to fetch" Error When Reporting Wait Times

- Make sure you're logged in (authentication required)
- Check browser console for detailed error messages
- Verify Supabase RLS policies are set up correctly

### Backend Server Not Starting

- Check that `server/.env` exists and has `PORT=3001`
- Verify Node.js version: `node --version` (should be v18+)
- Check server console for error messages

## Quick Start (Minimal Setup)

If you just want to test the app quickly:

1. **Install dependencies:**
   ```bash
   npm install
   cd server && npm install && cd ..
   ```

2. **Set up Supabase:**
   - Create a `.env` in root with Supabase credentials
   - Run migrations via Supabase dashboard

3. **Start servers:**
   ```bash
   # Terminal 1
   cd server && node index.js
   
   # Terminal 2
   npm run dev
   ```

4. **Open browser:** `http://localhost:5173`

## Development Commands

- `npm run dev` - Start frontend dev server
- `npm run build` - Build for production
- `npm run preview` - Preview production build
- `npm run lint` - Run ESLint

## Project Structure

```
medichub-ai-assist/
├── src/                    # Frontend React app
│   ├── components/         # React components
│   ├── pages/              # Page components
│   ├── hooks/              # Custom React hooks
│   └── integrations/       # Supabase client
├── server/                 # Backend Node.js server
│   ├── index.js           # Main server file
│   ├── clinics.json       # Local clinic data
│   └── kb/                # Knowledge base (markdown files)
├── supabase/              # Supabase configuration
│   ├── migrations/        # Database migrations
│   └── functions/        # Edge functions
└── .env                   # Frontend environment variables
```

## Need Help?

- Check the browser console (F12) for errors
- Check the server console for backend errors
- Verify all environment variables are set correctly
- Ensure Supabase migrations have been applied

